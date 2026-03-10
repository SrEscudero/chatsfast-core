import { logger } from '../config/logger';
import instanceRepository from '../repositories/instances.repository';
import { prisma } from '../lib/prisma';

// ============================================================
// TIPOS — Estructura real de Evolution API v2
// ============================================================

interface MessageKey {
  remoteJid: string;
  fromMe:    boolean;
  id:        string;
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
    imageMessage?:         { caption?: string };
    videoMessage?:         { caption?: string };
    audioMessage?:         Record<string, unknown>;
    documentMessage?:      { fileName?: string };
    stickerMessage?:       Record<string, unknown>;
    reactionMessage?:      { text: string; key: MessageKey };
    locationMessage?:      { degreesLatitude: number; degreesLongitude: number };
    // ↓ Este es el tipo especial que llega cuando alguien vota en una encuesta
    pollUpdateMessage?: {
      pollCreationMessageKey: MessageKey; // Key del poll original (para saber a cuál encuesta)
      vote: {
        selectedOptions: PollVote[];      // Opciones que el usuario seleccionó/deseleccionó
      };
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
function extractMessageText(msg: IncomingMessage): string {
  const m = msg.message;
  if (!m) return '[sin contenido]';

  if (m.conversation)                    return m.conversation;
  if (m.extendedTextMessage?.text)       return m.extendedTextMessage.text;
  if (m.imageMessage?.caption)           return `🖼️ Imagen: ${m.imageMessage.caption}`;
  if (m.imageMessage)                    return '🖼️ Imagen';
  if (m.videoMessage?.caption)           return `🎥 Video: ${m.videoMessage.caption}`;
  if (m.videoMessage)                    return '🎥 Video';
  if (m.audioMessage)                    return '🎵 Audio';
  if (m.documentMessage?.fileName)       return `📄 Documento: ${m.documentMessage.fileName}`;
  if (m.documentMessage)                 return '📄 Documento';
  if (m.stickerMessage)                  return '🎭 Sticker';
  if (m.reactionMessage)                 return `⚡ Reacción: ${m.reactionMessage.text}`;
  if (m.locationMessage)                 return `📍 Ubicación: ${m.locationMessage.degreesLatitude}, ${m.locationMessage.degreesLongitude}`;
  if (m.pollCreationMessage)             return `📊 Encuesta: "${m.pollCreationMessage.name}"`;

  return '[tipo de mensaje no reconocido]';
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
    const text      = extractMessageText(msg);
    const sender    = msg.key.remoteJid;
    const pushName  = msg.pushName ?? null;
    const messageId = msg.key.id;
    const fromMe    = msg.key.fromMe;

    logger.info(`📨 MENSAJE ${fromMe ? 'ENVIADO' : 'RECIBIDO'} | id: ${messageId} | remoteJid: ${sender} | de: ${pushName ?? 'Desconocido'} | texto: ${text}`);

    try {
      const instance = await prisma.instance.findFirst({
        where: { name: instanceName },
        select: { id: true },
      });
      if (!instance) {
        logger.warn(`⚠️ Instancia no encontrada en DB: ${instanceName}`);
        return;
      }

      const isGroup = sender.includes('@g.us');
      const phone   = isGroup ? null : sender.replace(/@.*/, '');
      const msgTs   = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : new Date();

      // Upsert contacto — solo incrementa unread en mensajes recibidos
      const contact = await prisma.contact.upsert({
        where: { instanceId_remoteJid: { instanceId: instance.id, remoteJid: sender } },
        update: {
          ...(pushName && !fromMe ? { name: pushName } : {}),
          lastMessage: text,
          lastMessageAt: msgTs,
          ...(fromMe ? {} : { unreadCount: { increment: 1 } }),
        },
        create: {
          instanceId: instance.id,
          remoteJid: sender,
          name: fromMe ? null : pushName,
          phone,
          isGroup,
          lastMessage: text,
          lastMessageAt: msgTs,
          unreadCount: fromMe ? 0 : 1,
        },
      });

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
          type: msgType,
          content: text,
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