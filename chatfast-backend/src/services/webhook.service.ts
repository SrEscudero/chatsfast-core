import { logger } from '../config/logger';
import instanceRepository from '../repositories/instances.repository';
import { prisma } from '../lib/prisma';
import { evolutionApi } from '../config/evolution';

// ============================================================
// TIPOS — Estructura real de Evolution API v2
// ============================================================

interface MessageKey {
  remoteJid:   string;
  fromMe:      boolean;
  id:          string;
  participant?: string; // JID del miembro que envió en un grupo
}

interface PollVote {
  name:              string;   // Texto de la opción votada
  senderTimestampMs: number;
}

interface IncomingMessage {
  key:      MessageKey;
  pushName?: string;
  message?: {
    conversation?:         string;
    extendedTextMessage?:  { text: string };
    imageMessage?:         { caption?: string; url?: string; mimetype?: string };
    videoMessage?:         { caption?: string; url?: string; mimetype?: string };
    audioMessage?:         { url?: string; mimetype?: string; [k: string]: unknown };
    documentMessage?:      { fileName?: string; url?: string; mimetype?: string };
    stickerMessage?:       Record<string, unknown>;
    reactionMessage?:      { text: string; key: MessageKey };
    locationMessage?:      { degreesLatitude: number; degreesLongitude: number; name?: string; address?: string };
    pollUpdateMessage?: {
      pollCreationMessageKey: MessageKey;
      vote: { selectedOptions: PollVote[] };
    };
    pollCreationMessage?: {
      name:    string;
      options: { optionName: string }[];
    };
  };
  messageTimestamp?: number;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * isPollVote
 *
 * WhatsApp NO envía un evento separado para votos de encuesta.
 * Los votos llegan como pollUpdateMessage dentro de MESSAGES_UPSERT,
 * mezclados con mensajes de texto normales.
 * Esta función los detecta antes de procesarlos.
 */
function isPollVote(msg: IncomingMessage): boolean {
  return !!msg.message?.pollUpdateMessage;
}

/**
 * extractMessageText
 *
 * Extrae texto legible de cualquier tipo de mensaje excepto pollUpdateMessage
 * (ese tiene su propio handler dedicado para automatización).
 */
interface MessageFields {
  content:  string;
  mediaUrl: string | null;
  mediaKey: string | null;
  mimetype: string | null;
  caption:  string | null;
}

function normalizeMediaKey(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  // Evolution API sometimes sends mediaKey as a byte-index object: {0: 90, 1: 159, ...}
  if (typeof raw === 'object') {
    const bytes = Object.values(raw as Record<string, number>);
    return Buffer.from(bytes).toString('base64');
  }
  return null;
}

function extractMessageFields(msg: IncomingMessage): MessageFields {
  const m = msg.message;
  if (!m) return { content: '[sin contenido]', mediaUrl: null, mediaKey: null, mimetype: null, caption: null };

  if (m.conversation)              return { content: m.conversation,              mediaUrl: null, mediaKey: null, mimetype: null, caption: null };
  if (m.extendedTextMessage?.text) return { content: m.extendedTextMessage.text, mediaUrl: null, mediaKey: null, mimetype: null, caption: null };

  if (m.imageMessage)    return { content: '🖼️ Imagen',    mediaUrl: m.imageMessage.url    ?? null, mediaKey: normalizeMediaKey((m.imageMessage as any).mediaKey),    mimetype: m.imageMessage.mimetype    ?? 'image/jpeg', caption: m.imageMessage.caption    ?? null };
  if (m.videoMessage)    return { content: '🎥 Video',     mediaUrl: m.videoMessage.url    ?? null, mediaKey: normalizeMediaKey((m.videoMessage as any).mediaKey),    mimetype: m.videoMessage.mimetype    ?? 'video/mp4',  caption: m.videoMessage.caption    ?? null };
  if (m.audioMessage)    return { content: '🎵 Audio',     mediaUrl: (m.audioMessage as any).url ?? null, mediaKey: normalizeMediaKey((m.audioMessage as any).mediaKey), mimetype: (m.audioMessage as any).mimetype ?? 'audio/ogg', caption: null };
  if (m.documentMessage) return { content: '📄 Documento', mediaUrl: m.documentMessage.url ?? null, mediaKey: normalizeMediaKey((m.documentMessage as any).mediaKey), mimetype: m.documentMessage.mimetype ?? 'application/octet-stream', caption: m.documentMessage.fileName ?? null };
  if (m.stickerMessage)  return { content: '🎭 Sticker',   mediaUrl: (m.stickerMessage as any).url ?? null, mediaKey: normalizeMediaKey((m.stickerMessage as any).mediaKey), mimetype: (m.stickerMessage as any).mimetype ?? 'image/webp', caption: null };

  if (m.locationMessage) {
    const lat   = m.locationMessage.degreesLatitude;
    const lng   = m.locationMessage.degreesLongitude;
    const label = m.locationMessage.name ?? m.locationMessage.address ?? null;
    return { content: `📍 ${label ?? `${lat},${lng}`}`, mediaUrl: `https://www.google.com/maps?q=${lat},${lng}`, mediaKey: null, mimetype: null, caption: label };
  }

  if (m.reactionMessage)     return { content: `⚡ Reacción: ${m.reactionMessage.text}`,         mediaUrl: null, mediaKey: null, mimetype: null, caption: null };
  if (m.pollCreationMessage) return { content: `📊 Encuesta: "${m.pollCreationMessage.name}"`,  mediaUrl: null, mediaKey: null, mimetype: null, caption: null };

  return { content: '[tipo de mensaje no reconocido]', mediaUrl: null, mediaKey: null, mimetype: null, caption: null };
}

function extractMessageText(msg: IncomingMessage): string {
  return extractMessageFields(msg).content;
}

// ============================================================
// WEBHOOK SERVICE
// ============================================================

export class WebhookService {

  async processEvent(payload: any): Promise<void> {
    try {
      const { event, instance, data } = payload;

      logger.info(`📥 Webhook recibido: [${event}] de la instancia [${instance}]`);

      switch (event) {
        case 'messages.upsert':
        case 'MESSAGES_UPSERT':
          await this.handleNewMessage(instance, data);
          break;

        case 'connection.update':
        case 'CONNECTION_UPDATE':
          await this.handleConnectionUpdate(instance, data);
          break;

        case 'send.message':
        case 'SEND_MESSAGE':
          logger.debug('✅ Mensaje enviado confirmado por Evolution', { instance });
          break;

        case 'qrcode.updated':
        case 'QRCODE_UPDATED':
          logger.info('📱 QR actualizado', { instance });
          break;

        case 'groups.upsert':
        case 'GROUPS_UPSERT':
          await this.handleGroupsUpsert(instance, data);
          break;

        case 'groups.update':
        case 'GROUPS_UPDATE':
          await this.handleGroupsUpsert(instance, data);
          break;

        default:
          logger.debug(`🔕 Evento no procesado: ${event}`, { instance });
      }
    } catch (error: any) {
      logger.error('❌ Error procesando webhook', { error: error.message, payload });
    }
  }

  // ----------------------------------------------------------
  // handleNewMessage
  //
  // Punto de entrada para MESSAGES_UPSERT.
  // Normaliza los 3 formatos posibles de Evolution v2 y despacha
  // cada mensaje al handler correcto según su tipo:
  //   pollUpdateMessage → handlePollVote
  //   texto/media/etc   → handleTextMessage
  // ----------------------------------------------------------
  private async handleNewMessage(instanceName: string, data: any): Promise<void> {
    let messages: IncomingMessage[] = [];

    if (Array.isArray(data)) {
      messages = data;
    } else if (Array.isArray(data?.messages)) {
      messages = data.messages;
    } else if (data?.key) {
      messages = [data];
    } else {
      logger.warn('⚠️ Estructura de messages.upsert no reconocida', { data });
      return;
    }

    for (const msg of messages) {
      const remoteJid = msg.key?.remoteJid ?? '';

      // Ignorar JIDs inválidos (IDs internos de Evolution sin '@', status broadcasts, etc.)
      if (!remoteJid || !remoteJid.includes('@')) {
        logger.debug(`⏭️ Mensaje ignorado: remoteJid inválido "${remoteJid}"`);
        continue;
      }

      // Ignorar JIDs internos de WhatsApp/Evolution que no son contactos reales
      if (remoteJid === 'status@broadcast') continue;
      if (remoteJid.endsWith('@lid'))        continue; // dispositivo vinculado

      // ── Fix mensajes de grupo ──────────────────────────────────────────────
      // Evolution API a veces envía mensajes de grupo con el JID del participante
      // individual como remoteJid en lugar del JID del grupo (@g.us).
      // Detectamos esto por: tiene key.participant Y remoteJid NO es @g.us.
      // En ese caso lo ignoramos: el mismo mensaje llega (o llegará) con el JID
      // correcto del grupo en otro evento.
      if (msg.key.participant && !remoteJid.includes('@g.us')) {
        logger.debug(`⏭️ Evento de participante de grupo ignorado (remoteJid individual): ${remoteJid}`);
        continue;
      }

      // Los votos de encuesta se procesan siempre (incluso fromMe:true en algunos casos)
      if (isPollVote(msg)) {
        await this.handlePollVote(instanceName, msg);
        continue;
      }

      // Guardar todos los mensajes (fromMe y recibidos) para que el CRM los muestre
      await this.handleTextMessage(instanceName, msg);
    }
  }

  // ----------------------------------------------------------
  // handleTextMessage
  //
  // Procesa mensajes de texto, imágenes, audio, etc.
  // El log incluye el messageId para poder usar mark-read y reactions.
  // ----------------------------------------------------------
  private async handleTextMessage(instanceName: string, msg: IncomingMessage): Promise<void> {
    const { content: text, mediaUrl, mediaKey, mimetype, caption } = extractMessageFields(msg);
    const sender    = msg.key.remoteJid;
    const pushName  = msg.pushName ?? null;
    const messageId = msg.key.id;
    const fromMe    = msg.key.fromMe;

    const participant = msg.key.participant ?? null; // JID del miembro en grupos
    logger.info(`📨 MENSAJE ${fromMe ? 'ENVIADO' : 'RECIBIDO'} | id: ${messageId} | remoteJid: ${sender} | de: ${pushName ?? participant ?? 'Desconocido'} | texto: ${text}`);

    try {
      const instance = await prisma.instance.findFirst({
        where: { name: instanceName },
        select: { id: true },
      });
      if (!instance) {
        logger.warn(`⚠️ Instancia no encontrada en DB: ${instanceName}`);
        return;
      }

      const isGroup  = sender.includes('@g.us');
      const phone    = isGroup ? null : sender.replace(/@.*/, '');
      const msgTs    = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : new Date();

      // senderName: nombre del remitente dentro del grupo.
      // Solo se aplica a mensajes recibidos en grupos (pushName = nombre del que escribió).
      // Para contactos individuales o mensajes propios, no se guarda.
      const senderName = (isGroup && !fromMe && pushName) ? pushName : null;

      // Upsert contacto — solo incrementa unread en mensajes recibidos
      // NOTA: En grupos NO actualizamos el nombre del contacto con pushName,
      // ya que pushName es el nombre del miembro que escribió, no el nombre del grupo.
      const contact = await prisma.contact.upsert({
        where: { instanceId_remoteJid: { instanceId: instance.id, remoteJid: sender } },
        update: {
          ...(!isGroup && pushName && !fromMe ? { name: pushName } : {}),
          lastMessage: isGroup && senderName ? `${senderName}: ${text}` : text,
          lastMessageAt: msgTs,
          ...(fromMe ? {} : { unreadCount: { increment: 1 } }),
        },
        create: {
          instanceId: instance.id,
          remoteJid: sender,
          name: fromMe ? null : (!isGroup ? pushName : null),
          phone,
          isGroup,
          lastMessage: isGroup && senderName ? `${senderName}: ${text}` : text,
          lastMessageAt: msgTs,
          unreadCount: fromMe ? 0 : 1,
        },
      });

      // Si es un grupo nuevo sin nombre, obtener el subject en background
      if (isGroup && !contact.name) {
        this.fetchGroupNameInBackground(instanceName, contact.id, sender).catch(() => {});
      }

      // Guardar mensaje (upsert por messageId para evitar duplicados del webhook)
      const msgType = msg.message
        ? Object.keys(msg.message).find(k => k !== 'messageContextInfo') ?? 'text'
        : 'text';

      await prisma.message.upsert({
        where: { instanceId_messageId: { instanceId: instance.id, messageId } },
        update: {},
        create: {
          instanceId: instance.id,
          contactId: contact.id,
          remoteJid: sender,
          messageId,
          fromMe,
          senderName,
          type: msgType,
          content: text,
          mediaUrl,
          mediaKey,
          mimetype,
          caption,
          status: fromMe ? 'SENT' : 'DELIVERED',
          timestamp: msgTs,
        },
      });

      logger.debug(`✅ Mensaje guardado | instanceId: ${instance.id} | contactId: ${contact.id} | fromMe: ${fromMe}`);
    } catch (dbError: any) {
      logger.error(`❌ Error guardando mensaje en DB: ${dbError.message}`, { instanceName, messageId });
    }
  }

  // ----------------------------------------------------------
  // handlePollVote
  //
  // Procesa votos de encuesta (pollUpdateMessage).
  //
  // Por qué necesita handler propio:
  //   WhatsApp envía los votos dentro de MESSAGES_UPSERT mezclados
  //   con texto normal. Sin esta detección, los votos se ignoran
  //   y el bot nunca puede responder automáticamente.
  //
  // IMPORTANTE — selectedOptions vacío = deselección:
  //   Cuando el usuario QUITA su voto, llega selectedOptions: [].
  //   Lo ignoramos para no disparar respuestas en deselecciones.
  //
  // Flujo de automatización (implementar en la siguiente fase):
  //   1. Leer la opción votada desde votedOptions[0]
  //   2. Buscar en DB qué respuesta corresponde a esa opción
  //   3. Llamar messageService.sendText() con la respuesta
  // ----------------------------------------------------------
  private async handlePollVote(instanceName: string, msg: IncomingMessage): Promise<void> {
    const pollUpdate = msg.message?.pollUpdateMessage;
    if (!pollUpdate) return;

    const voter           = msg.key.remoteJid;
    const voterName       = msg.pushName ?? 'Desconocido';
    const pollMessageId   = pollUpdate.pollCreationMessageKey?.id ?? 'unknown';
    
    // Extraemos de vote o metadata (Evolution usa ambas según la sub-versión)
    const selectedOptions = pollUpdate.vote?.selectedOptions 
      ?? (pollUpdate as any).metadata?.selectedOptions 
      ?? [];

    // Ignorar deselecciones (usuario quitó su voto)
    if (selectedOptions.length === 0) {
      logger.debug(`🗳️ Voto removido | pollId: ${pollMessageId} | de: ${voterName}`);
      return;
    }

    // 🚨 EL FIX: Mapeo universal. 
    // Si es un string, lo usa. Si es objeto, busca 'name' u 'optionName'.
    const votedOptions = selectedOptions.map((opt: any) => {
      if (typeof opt === 'string') return opt;
      return opt?.name || opt?.optionName || JSON.stringify(opt);
    });

    logger.info(`🗳️ VOTO EN ENCUESTA | pollId: ${pollMessageId} | de: ${voterName} (${voter}) | opciones: [${votedOptions.join(', ')}]`);

    // ──────────────────────────────────────────────────────────────
    // TODO: Automatización de respuestas por opción votada
    //
    // const instance = await instanceRepository.findByName(instanceName);
    // if (!instance) return;
    //
    // switch (votedOptions[0]) {
    //
    //   case '🛍️ Ver catálogo':
    //     await messageService.sendText(instance.id, {
    //       number: voter,
    //       text: 'Aquí está nuestro catálogo 👇',
    //       delay: 1000,
    //     });
    //     await messageService.sendMedia(instance.id, {
    //       number: voter,
    //       mediatype: 'document',
    //       media: 'https://tudominio.com/catalogo.pdf',
    //       fileName: 'Catalogo_ChatFast.pdf',
    //     });
    //     break;
    //
    //   case '📦 Estado de mi pedido':
    //     await messageService.sendText(instance.id, {
    //       number: voter,
    //       text: 'Para consultar tu pedido necesito tu número de orden. ¿Me lo puedes compartir?',
    //       delay: 800,
    //     });
    //     break;
    //
    //   case '💬 Hablar con un asesor':
    //     await messageService.sendText(instance.id, {
    //       number: voter,
    //       text: 'Perfecto, te conecto con un asesor ahora mismo 🙏',
    //       delay: 800,
    //     });
    //     await messageService.sendContact(instance.id, {
    //       number: voter,
    //       contact: [{ fullName: 'Kelvis - ChatFast', wuid: '5215509876543' }],
    //     });
    //     break;
    //
    //   default:
    //     await messageService.sendText(instance.id, {
    //       number: voter,
    //       text: 'Gracias por tu respuesta. Un asesor te contactará pronto.',
    //       delay: 1000,
    //     });
    // }
    // ──────────────────────────────────────────────────────────────
  }

  // ----------------------------------------------------------
  // fetchGroupNameInBackground
  //
  // Cuando un mensaje de grupo llega por primera vez y el contacto
  // se crea sin nombre (no tenemos el subject aún), llamamos a Evolution
  // en background para obtener el subject real del grupo.
  // ----------------------------------------------------------
  private async fetchGroupNameInBackground(instanceName: string, contactId: string, groupJid: string): Promise<void> {
    try {
      const client = evolutionApi.getInstance();
      // Evolution API v2: GET /group/fetchGroupMetaData/{instance}?groupJid=xxx
      const { data } = await client.get(`/group/fetchGroupMetaData/${instanceName}`, {
        params: { groupJid },
      });
      const subject = data?.subject ?? data?.name ?? null;
      if (subject) {
        await prisma.contact.update({ where: { id: contactId }, data: { name: subject } });
        logger.info(`✅ Nombre de grupo actualizado: "${subject}" (${groupJid})`);
      }
    } catch (err: any) {
      logger.debug(`⚠️ No se pudo obtener nombre del grupo ${groupJid}: ${err.message}`);
    }
  }

  // ----------------------------------------------------------
  // handleGroupsUpsert
  //
  // Procesa grupos.upsert / groups.update — actualiza el nombre
  // (subject) de grupos ya guardados en DB.
  // ----------------------------------------------------------
  private async handleGroupsUpsert(instanceName: string, data: any): Promise<void> {
    const groups: any[] = Array.isArray(data) ? data : (data ? [data] : []);
    if (groups.length === 0) return;

    const instance = await prisma.instance.findFirst({
      where: { name: instanceName },
      select: { id: true },
    });
    if (!instance) return;

    for (const g of groups) {
      const groupJid = g.id ?? g.jid ?? g.remoteJid ?? '';
      const subject  = g.subject ?? g.name ?? null;
      if (!groupJid || !subject || !groupJid.includes('@g.us')) continue;

      await prisma.contact.updateMany({
        where: { instanceId: instance.id, remoteJid: groupJid },
        data:  { name: subject },
      });
      logger.info(`✅ Nombre de grupo sincronizado vía evento: "${subject}" (${groupJid})`);
    }
  }

  // ----------------------------------------------------------
  // handleConnectionUpdate
  // ----------------------------------------------------------
  private async handleConnectionUpdate(instanceName: string, data: any): Promise<void> {
    const state        = data?.state ?? data?.status ?? 'unknown';
    const statusReason = data?.statusReason;

    logger.info(`🔄 Cambio de conexión en "${instanceName}": ${state}`, { statusReason });

    const dbInstance = await instanceRepository.findByName(instanceName);
    if (!dbInstance) {
      logger.warn(`⚠️ Instancia "${instanceName}" no encontrada en DB para actualizar estado`);
      return;
    }

    const statusMap: Record<string, string> = {
      open:       'CONNECTED',
      close:      'DISCONNECTED',
      connecting: 'CONNECTING',
      refused:    'ERROR',
    };

    const newStatus = statusMap[state];
    if (newStatus) {
      await instanceRepository.updateStatus(dbInstance.id, newStatus as any);
      logger.info(`✅ Estado de "${instanceName}" actualizado a ${newStatus}`);
    }
  }
}

export const webhookService = new WebhookService();
export default webhookService;