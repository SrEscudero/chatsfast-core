import crypto from 'crypto';
import { promisify } from 'util';
import axios from 'axios';
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

// ─── Helper: extrae campos multimedia del tipo FetchedMessage (historial) ─────
interface FetchedFields { content: string; mediaUrl: string | null; mediaKey: string | null; mimetype: string | null; caption: string | null; }

function normalizeMediaKey(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    const bytes = Object.values(raw as Record<string, number>);
    return Buffer.from(bytes).toString('base64');
  }
  return null;
}

function extractFetchedFields(msg: any): FetchedFields {
  const m = msg?.message ?? msg;
  const none: FetchedFields = { content: '[sin contenido]', mediaUrl: null, mediaKey: null, mimetype: null, caption: null };

  if (!m) return none;

  if (m?.locationMessage) {
    const lat = m.locationMessage.degreesLatitude;
    const lng = m.locationMessage.degreesLongitude;
    const label = m.locationMessage.name ?? m.locationMessage.address ?? null;
    return { content: `📍 ${label ?? `${lat},${lng}`}`, mediaUrl: `https://www.google.com/maps?q=${lat},${lng}`, mediaKey: null, mimetype: null, caption: label };
  }

  if (m?.imageMessage)    return { content: '🖼️ Imagen',    mediaUrl: m.imageMessage.url    ?? null, mediaKey: normalizeMediaKey(m.imageMessage.mediaKey),    mimetype: m.imageMessage.mimetype    ?? 'image/jpeg', caption: m.imageMessage.caption    ?? null };
  if (m?.videoMessage)    return { content: '🎥 Video',     mediaUrl: m.videoMessage.url    ?? null, mediaKey: normalizeMediaKey(m.videoMessage.mediaKey),    mimetype: m.videoMessage.mimetype    ?? 'video/mp4',  caption: m.videoMessage.caption    ?? null };
  if (m?.audioMessage)    return { content: '🎵 Audio',     mediaUrl: m.audioMessage.url    ?? null, mediaKey: normalizeMediaKey(m.audioMessage.mediaKey),    mimetype: m.audioMessage.mimetype    ?? 'audio/ogg',  caption: null };
  if (m?.documentMessage) return { content: '📄 Documento', mediaUrl: m.documentMessage.url ?? null, mediaKey: normalizeMediaKey(m.documentMessage.mediaKey), mimetype: m.documentMessage.mimetype ?? 'application/octet-stream', caption: m.documentMessage.fileName ?? null };
  if (m?.stickerMessage)  return { content: '🎭 Sticker',   mediaUrl: m.stickerMessage.url  ?? null, mediaKey: normalizeMediaKey(m.stickerMessage.mediaKey),  mimetype: m.stickerMessage.mimetype  ?? 'image/webp', caption: null };

  const text = extractLastMsgText(msg);
  if (text) return { content: text, mediaUrl: null, mediaKey: null, mimetype: null, caption: null };

  const keys = Object.keys(m).filter((k: string) => k !== 'messageContextInfo');
  return { content: keys.length ? `[${keys[0]}]` : '[sin contenido]', mediaUrl: null, mediaKey: null, mimetype: null, caption: null };
}

// ─── Helper: guarda en DB los mensajes traídos de Evolution API ───────────────
async function saveFetchedMessages(
  instanceId: string,
  contactId: string,
  remoteJid: string,
  messages: any[],
): Promise<number> {
  let saved = 0;
  const isGroup = remoteJid.includes('@g.us');

  for (const msg of messages) {
    const messageId = msg?.key?.id;
    if (!messageId) continue;

    const fromMe     = msg?.key?.fromMe ?? false;
    const pushName   = msg?.pushName ?? null;
    const { content, mediaUrl, mediaKey, mimetype, caption } = extractFetchedFields(msg);
    const senderName = (isGroup && !fromMe && pushName) ? pushName : null;
    const msgType    = msg?.message
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
          senderName,
          type: msgType,
          content,
          mediaUrl,
          mediaKey,
          mimetype,
          caption,
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

    // 1b. Limpiar participantes fantasma de grupos:
    //     Contactos @s.whatsapp.net cuyos mensajes apuntan a un @g.us (remoteJid del mensaje ≠ del contacto)
    //     Estos son artefactos del bug donde Evolution duplicaba el evento con el JID del participante.
    const phantomCandidates = await prisma.contact.findMany({
      where: { instanceId, remoteJid: { endsWith: '@s.whatsapp.net' }, isGroup: false },
      select: { id: true, remoteJid: true, messages: { select: { remoteJid: true }, take: 1 } },
    });
    const phantomIds = phantomCandidates
      .filter(c => c.messages.length > 0 && c.messages[0].remoteJid.includes('@g.us'))
      .map(c => c.id);
    if (phantomIds.length > 0) {
      await prisma.contact.deleteMany({ where: { id: { in: phantomIds } } });
      logger.info(`[Sync] Eliminados ${phantomIds.length} participantes fantasma de grupos`);
    }

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
    //    Fuente 1: fetchAllGroups (tiene el subject real)
    for (const g of groups) {
      const gJid     = (g as any).id ?? (g as any).jid ?? (g as any).remoteJid ?? '';
      const gSubject = (g as any).subject ?? (g as any).name ?? null;
      if (gJid && gSubject) {
        nameByJid.set(gJid, gSubject);
        nameByJid.set(gJid.replace(/@.*/, ''), gSubject);
      }
    }
    // Fuente 2 (fallback): los propios chats también pueden traer el subject del grupo
    for (const c of chats) {
      const cJid = (c as any).remoteJid ?? (c as any).jid ?? c.id ?? '';
      if (!cJid.includes('@g.us')) continue;
      const subject = (c as any).subject ?? (c as any).name ?? null;
      if (subject && !nameByJid.has(cJid)) {
        nameByJid.set(cJid, subject);
        nameByJid.set(cJid.replace(/@.*/, ''), subject);
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
            // Grupos: siempre actualizar el nombre (el subject puede cambiar)
            // Contactos individuales: actualizar si tenemos nombre y es diferente
            ...(name && name !== bare ? { name } : {}),
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

    // 4b. Importar agenda del teléfono — contactos con nombre guardado en el teléfono
    //     pero que aún no tienen conversación. Esto permite buscarlos en el inbox.
    let phonebookCreated = 0;
    const chatJids = new Set(
      chats.map((c: any) => (c as any).remoteJid ?? (c as any).jid ?? c.id ?? '').filter(Boolean),
    );
    for (const c of addressBook) {
      const cJid  = (c as any).id ?? (c as any).jid ?? (c as any).remoteJid ?? '';
      const cName = (c as any).name ?? (c as any).notify ?? (c as any).pushname ?? null;
      if (!cJid || !cJid.includes('@') || !cName) continue;
      if (cJid === 'status@broadcast' || cJid.endsWith('@lid') || cJid.endsWith('@g.us')) continue;
      if (chatJids.has(cJid)) continue; // ya fue procesado como chat activo

      const cPhone = cJid.replace(/@.*/, '');
      const alreadyExists = await prisma.contact.findUnique({
        where: { instanceId_remoteJid: { instanceId, remoteJid: cJid } },
        select: { id: true },
      });
      if (!alreadyExists) {
        await prisma.contact.create({
          data: { instanceId, remoteJid: cJid, name: cName, phone: cPhone, isGroup: false },
        });
        phonebookCreated++;
      }
    }
    if (phonebookCreated > 0) logger.info(`[Sync] ${phonebookCreated} contactos de agenda importados`);

    // 5. Eliminar contactos sin mensajes que ya no están en Evolution
    //    IMPORTANTE: solo se ejecuta si Evolution devolvió chats (para no borrar al parsear mal)
    //    Solo elimina contactos sin historial — nunca toca contactos con mensajes reales.
    let deleted = 0;
    if (chats.length > 0) {
      const validJids = new Set(
        chats
          .map((c: any) => (c as any).remoteJid ?? (c as any).jid ?? c.id ?? '')
          .filter((j: string) => j.includes('@')),
      );
      // También agregar los JIDs de la agenda (no se borran contactos de phonebook)
      for (const c of addressBook) {
        const j = (c as any).id ?? (c as any).jid ?? (c as any).remoteJid ?? '';
        if (j && j.includes('@')) validJids.add(j);
      }

      const result = await prisma.contact.deleteMany({
        where: {
          instanceId,
          NOT: { remoteJid: { in: [...validJids] } },
          messages: { none: {} },   // SOLO contactos sin mensajes — nunca borra historial
          isGroup: false,           // nunca borrar grupos automáticamente
        },
      });
      deleted = result.count;
      if (deleted > 0) logger.info(`[Sync] Limpiados ${deleted} contactos sin historial huérfanos`);
    } else {
      logger.warn(`[Sync] fetchChats retornó 0 chats — se omite la limpieza para evitar pérdida de datos`);
    }

    logger.info(`[Sync] Instancia ${instanceId}: ${chats.length} chats, ${created} creados, ${updated} actualizados, ${phonebookCreated} agenda, ${deleted} eliminados`);
    ApiResponder.success(res, {
      synced: chats.length,
      created,
      updated,
      phonebookCreated,
      deleted,
      message: `${chats.length} chats y ${phonebookCreated} contactos de agenda sincronizados`,
    });
  } catch (e) { next(e); }
});

// ─── POST /api/v1/instances/:instanceId/contacts/start ───────────────────────
// Crea o encuentra un contacto por número de teléfono para iniciar un chat.
router.post('/start', async (req: any, res, next) => {
  try {
    const { instanceId } = req.params;
    let { phone } = req.body;

    // Normalizar: quitar espacios, guiones, paréntesis, signo +
    phone = String(phone ?? '').replace(/[\s\-\(\)\+]/g, '');
    if (!phone || !/^\d{7,15}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PHONE', message: 'Número de teléfono inválido (solo dígitos, 7-15 caracteres)' },
      });
    }

    const remoteJid = `${phone}@s.whatsapp.net`;

    const contact = await prisma.contact.upsert({
      where: { instanceId_remoteJid: { instanceId, remoteJid } },
      update: {},
      create: { instanceId, remoteJid, name: null, phone, isGroup: false },
    });

    ApiResponder.success(res, contact, 'Contacto listo para chatear');
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

// ─── GET /api/v1/instances/:instanceId/contacts/:contactId/messages/:messageId/media ──
// Descarga el archivo del CDN de WhatsApp y lo desencripta usando el mediaKey
// almacenado durante el webhook. Devuelve el archivo en claro al frontend.
//
// WhatsApp encripta los archivos en su CDN con AES-256-CBC.
// El proceso de descifrado sigue el protocolo de Baileys / Signal Media Keys:
//   1. HKDF(mediaKey, 112 bytes, info="WhatsApp {Type} Keys") → iv(16) + cipherKey(32) + macKey(32)
//   2. Descargar archivo encriptado del CDN (últimos 10 bytes = MAC tag)
//   3. AES-256-CBC decrypt(enc[:-10], cipherKey, iv)
// ─────────────────────────────────────────────────────────────────────────────

const hkdfAsync = promisify(crypto.hkdf);

const WA_MEDIA_INFO: Record<string, string> = {
  imageMessage:    'WhatsApp Image Keys',
  videoMessage:    'WhatsApp Video Keys',
  audioMessage:    'WhatsApp Audio Keys',
  documentMessage: 'WhatsApp Document Keys',
  stickerMessage:  'WhatsApp Image Keys',
};

async function decryptWhatsAppMedia(encrypted: Buffer, mediaKeyB64: string, msgType: string): Promise<Buffer> {
  const mediaKey = Buffer.from(mediaKeyB64, 'base64');
  const info     = Buffer.from(WA_MEDIA_INFO[msgType] ?? 'WhatsApp Image Keys');
  const salt     = Buffer.alloc(32, 0);

  const expandedRaw = await hkdfAsync('sha256', mediaKey, salt, info, 112);
  const expanded    = Buffer.from(expandedRaw);

  const iv        = expanded.subarray(0, 16);
  const cipherKey = expanded.subarray(16, 48);

  // Quitar los 10 bytes finales (MAC tag) antes de descifrar
  const enc      = encrypted.subarray(0, -10);
  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

router.get('/:contactId/messages/:messageId/media', async (req: any, res, next) => {
  try {
    const { instanceId, contactId, messageId: dbMsgId } = req.params;

    // 1. Buscar mensaje en DB
    const dbMsg = await prisma.message.findFirst({
      where: { id: dbMsgId, instanceId, contactId },
    });
    if (!dbMsg || !dbMsg.mediaUrl || !dbMsg.mediaKey) {
      return res.status(404).json({ success: false, error: { message: 'Media no disponible para este mensaje' } });
    }

    // 2. Descargar el archivo encriptado desde el CDN de WhatsApp
    let encrypted: Buffer;
    try {
      const cdnRes = await axios.get(dbMsg.mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
        headers: { 'User-Agent': 'WhatsApp/2.23.24.82 A' },
      });
      encrypted = Buffer.from(cdnRes.data as ArrayBuffer);
    } catch (cdnErr: any) {
      logger.warn(`[Media] CDN fetch failed: ${cdnErr.message}`);
      return res.status(502).json({ success: false, error: { message: 'No se pudo descargar el archivo desde WhatsApp CDN' } });
    }

    // 3. Descifrar con el mediaKey guardado
    let decrypted: Buffer;
    try {
      decrypted = await decryptWhatsAppMedia(encrypted, dbMsg.mediaKey, dbMsg.type);
    } catch (decErr: any) {
      logger.warn(`[Media] Decryption failed for msg ${dbMsg.messageId}: ${decErr.message}`);
      return res.status(500).json({ success: false, error: { message: 'Error al descifrar el archivo' } });
    }

    const contentType = dbMsg.mimetype ?? 'application/octet-stream';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(decrypted);
  } catch (e: any) {
    logger.warn(`[Media] Error inesperado: ${e.message}`);
    next(e);
  }
});

export default router;
