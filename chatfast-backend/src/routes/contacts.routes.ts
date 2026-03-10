import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ApiResponder } from '../utils/apiResponse';
import { fetchService } from '../services/fetch.service';
import { logger } from '../config/logger';

const router = Router({ mergeParams: true });
router.use(authenticate);

// ─── Helper: extrae texto legible del objeto lastMessage de Evolution API ──────
// Evolution devuelve el mensaje completo de WhatsApp, no un string.
function extractLastMsgText(lastMsg: any): string | null {
  if (!lastMsg) return null;

  // Puede venir directamente o dentro de .message
  const m = lastMsg?.message ?? lastMsg;
  if (!m || typeof m !== 'object') return null;

  if (typeof m.conversation === 'string')                  return m.conversation;
  if (typeof m.extendedTextMessage?.text === 'string')     return m.extendedTextMessage.text;
  if (m.imageMessage)    return m.imageMessage.caption  ? `🖼️ ${m.imageMessage.caption}`  : '🖼️ Imagen';
  if (m.videoMessage)    return m.videoMessage.caption  ? `🎥 ${m.videoMessage.caption}`  : '🎥 Video';
  if (m.audioMessage)    return '🎵 Audio';
  if (m.documentMessage) return m.documentMessage.fileName ? `📄 ${m.documentMessage.fileName}` : '📄 Documento';
  if (m.stickerMessage)  return '🎭 Sticker';
  if (m.pollCreationMessage) return `📊 ${m.pollCreationMessage.name ?? 'Encuesta'}`;
  if (m.reactionMessage) return `⚡ ${m.reactionMessage.text ?? 'Reacción'}`;
  if (m.locationMessage) return '📍 Ubicación';
  if (m.contactMessage)  return '👤 Contacto';

  // Algunos formatos de Evolution envuelven en key+message
  if (lastMsg?.key && lastMsg?.message) return extractLastMsgText(lastMsg.message);

  return null;
}

// ─── Helper: extrae texto del tipo FetchedMessage (historial) ─────────────────
function extractFetchedText(msg: any): string {
  const text = extractLastMsgText(msg);
  if (text) return text;

  // Fallback: inspeccionar el tipo
  const m = msg?.message;
  if (!m) return '[sin contenido]';
  const keys = Object.keys(m).filter(k => k !== 'messageContextInfo');
  if (keys.length) return `[${keys[0]}]`;
  return '[sin contenido]';
}

// ─── Helper: guarda en DB los mensajes traídos de Evolution API ───────────────
async function saveFetchedMessages(
  instanceId: string,
  contactId: string,
  remoteJid: string,
  messages: any[],
): Promise<number> {
  let saved = 0;
  for (const msg of messages) {
    const messageId = msg?.key?.id;
    if (!messageId) continue;

    const fromMe    = msg?.key?.fromMe ?? false;
    const content   = extractFetchedText(msg);
    const msgType   = msg?.message
      ? (Object.keys(msg.message).find(k => k !== 'messageContextInfo') ?? 'text')
      : 'text';
    const ts = msg?.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();

    try {
      await prisma.message.upsert({
        where: { instanceId_messageId: { instanceId, messageId } },
        update: {},
        create: {
          instanceId,
          contactId,
          remoteJid,
          messageId,
          fromMe,
          type: msgType,
          content,
          status: fromMe ? 'SENT' : 'DELIVERED',
          timestamp: ts,
        },
      });
      saved++;
    } catch { /* ignora errores por mensaje individual */ }
  }
  return saved;
}

// ─── GET /api/v1/instances/:instanceId/contacts ───────────────────────────────
router.get('/', async (req: any, res, next) => {
  try {
    const { instanceId } = req.params;
    const search = req.query.search as string | undefined;
    const page   = parseInt(req.query.page  as string) || 1;
    const limit  = parseInt(req.query.limit as string) || 30;

    const where: any = { instanceId };
    if (search) {
      where.OR = [
        { name:      { contains: search, mode: 'insensitive' } },
        { phone:     { contains: search, mode: 'insensitive' } },
        { remoteJid: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    ApiResponder.success(res, {
      items: contacts,
      pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    });
  } catch (e) { next(e); }
});

// ─── POST /api/v1/instances/:instanceId/contacts/sync ────────────────────────
// Importa chats de Evolution API → guarda como contactos en la DB
router.post('/sync', async (req: any, res, next) => {
  try {
    const { instanceId } = req.params;

    // 1. Limpiar registros inválidos en DB
    await prisma.contact.deleteMany({
      where: {
        instanceId,
        OR: [
          { NOT: { remoteJid: { contains: '@' } } },
          { remoteJid: 'status@broadcast' },
          { remoteJid: { endsWith: '@lid' } },
        ],
      },
    });

    // 2. Obtener chats, agenda de contactos y grupos de Evolution API
    let chats: any[]       = [];
    let addressBook: any[] = [];
    let groups: any[]      = [];

    try {
      [chats, addressBook, groups] = await Promise.all([
        fetchService.fetchChats(instanceId),
        fetchService.fetchContacts(instanceId).catch(() => []),
        fetchService.fetchGroups(instanceId).catch(() => []),
      ]);
    } catch (evolutionError: any) {
      const status = evolutionError?.statusCode ?? 0;
      if (status === 409 || status === 404) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'INSTANCE_DISCONNECTED',
            message: 'La instancia no está conectada a WhatsApp. Escanea el código QR primero.',
          },
        });
      }
      throw evolutionError;
    }

    // 3. Construir mapa JID → nombre desde la agenda del teléfono
    //    Evolution puede devolver el JID con o sin @s.whatsapp.net como clave
    const nameByJid = new Map<string, string>();
    for (const c of addressBook) {
      // Evolution v2: el JID puede venir en 'id', 'jid', 'remoteJid' o 'number'
      const cJid  = (c as any).id ?? (c as any).jid ?? (c as any).remoteJid ?? '';
      const cName = (c as any).name ?? (c as any).notify ?? (c as any).pushname ?? null;
      if (cJid && cName) {
        nameByJid.set(cJid, cName);
        // También guardar sin el sufijo @s.whatsapp.net como clave alternativa
        const bare = cJid.replace(/@.*/, '');
        if (bare) nameByJid.set(bare, cName);
      }
    }

    // 4. Construir mapa JID → subject desde la lista de grupos
    //    fetchAllGroups devuelve el subject real de cada grupo
    for (const g of groups) {
      const gJid     = (g as any).id ?? (g as any).jid ?? (g as any).remoteJid ?? '';
      const gSubject = (g as any).subject ?? (g as any).name ?? null;
      if (gJid && gSubject) {
        nameByJid.set(gJid, gSubject);
        nameByJid.set(gJid.replace(/@.*/, ''), gSubject);
      }
    }

    let created = 0;
    let updated = 0;

    for (const chat of chats) {
      // Evolution API v2: chat.id es un CUID interno; el JID real está en remoteJid
      const jid = (chat as any).remoteJid ?? (chat as any).jid ?? chat.id ?? '';
      if (!jid || !jid.includes('@')) continue;
      if (jid === 'status@broadcast')   continue;
      if (jid.endsWith('@lid'))          continue; // dispositivo vinculado — no es un contacto real

      const isGroup = jid.includes('@g.us');
      const phone   = isGroup ? null : jid.replace(/@.*/, '');

      // Nombre: agenda del teléfono → nombre del chat → subject del grupo → null
      const bare     = jid.replace(/@.*/, '');
      const chatName = (chat as any).name
        ?? (chat as any).subject           // grupos usan 'subject'
        ?? (chat as any).pushName
        ?? null;
      const name = nameByJid.get(jid) ?? nameByJid.get(bare) ?? chatName ?? null;

      // Unread count (Evolution usa distintos nombres de campo)
      const unreadRaw   = chat.unreadCount ?? (chat as any).unreadMessages ?? 0;
      const unreadCount = (typeof unreadRaw === 'number' && unreadRaw >= 0) ? unreadRaw : 0;

      // Timestamp del último mensaje
      const lastMsgRaw    = chat.lastMessageTime ?? (chat as any).updatedAt ?? null;
      const lastMessageAt = lastMsgRaw
        ? (typeof lastMsgRaw === 'number' ? new Date(lastMsgRaw * 1000) : new Date(String(lastMsgRaw)))
        : null;

      // Texto del último mensaje (Evolution lo manda como objeto, no string)
      const lastMessageText = extractLastMsgText((chat as any).lastMessage) ?? null;

      const existing = await prisma.contact.findUnique({
        where: { instanceId_remoteJid: { instanceId, remoteJid: jid } },
      });

      if (existing) {
        await prisma.contact.update({
          where: { id: existing.id },
          data: {
            // Solo actualizar nombre si lo encontramos y el campo está vacío
            ...(name && !existing.name ? { name } : {}),
            ...(name && existing.name !== name && name !== bare ? { name } : {}),
            unreadCount,
            ...(lastMessageAt ? { lastMessageAt } : {}),
            ...(lastMessageText ? { lastMessage: lastMessageText } : {}),
          },
        });
        updated++;
      } else {
        await prisma.contact.create({
          data: {
            instanceId,
            remoteJid: jid,
            name,
            phone,
            isGroup,
            unreadCount,
            lastMessageAt,
            ...(lastMessageText ? { lastMessage: lastMessageText } : {}),
          },
        });
        created++;
      }
    }

    logger.info(`[Sync] Instancia ${instanceId}: ${chats.length} chats, ${created} creados, ${updated} actualizados`);
    ApiResponder.success(res, {
      synced: chats.length,
      created,
      updated,
      message: `${chats.length} chats sincronizados (${created} nuevos, ${updated} actualizados)`,
    });
  } catch (e) { next(e); }
});

// ─── GET /api/v1/instances/:instanceId/contacts/:contactId/messages ───────────
// Si no hay mensajes en DB → auto-importa historial de Evolution API
router.get('/:contactId/messages', async (req: any, res, next) => {
  try {
    const { instanceId, contactId } = req.params;
    const page  = parseInt(req.query.page  as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    let [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { instanceId, contactId },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.message.count({ where: { instanceId, contactId } }),
    ]);

    // Auto-importar historial si no hay mensajes en DB (primera vez que se abre el chat)
    if (total === 0 && page === 1) {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { remoteJid: true },
      });

      if (contact?.remoteJid) {
        try {
          const history = await fetchService.fetchMessages(instanceId, contact.remoteJid, 50);
          if (history.length > 0) {
            await saveFetchedMessages(instanceId, contactId, contact.remoteJid, history);

            // Re-query con los mensajes recién importados
            [messages, total] = await Promise.all([
              prisma.message.findMany({
                where: { instanceId, contactId },
                orderBy: { timestamp: 'desc' },
                skip: 0,
                take: limit,
              }),
              prisma.message.count({ where: { instanceId, contactId } }),
            ]);

            logger.info(`[AutoImport] ${history.length} mensajes importados para contacto ${contactId}`);
          }
        } catch (fetchErr: any) {
          // No fatal — simplemente retornamos vacío si Evolution no responde
          logger.warn(`[AutoImport] No se pudo importar historial: ${fetchErr.message}`);
        }
      }
    }

    // Marcar como leído (solo si el contacto pertenece a esta instancia)
    await prisma.contact.updateMany({
      where: { id: contactId, instanceId },
      data:  { unreadCount: 0 },
    });

    // messages viene en orden desc; .reverse() da orden cronológico (más antiguo arriba)
    ApiResponder.success(res, { items: messages.reverse(), total });
  } catch (e) { next(e); }
});

export default router;
