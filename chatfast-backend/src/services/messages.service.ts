import axios from 'axios';
import { evolutionApi } from '../config/evolution';
import instanceRepository from '../repositories/instances.repository';
import { logger } from '../config/logger';
import { prisma } from '../lib/prisma';
import {
  SendTextDto,
  SendMediaDto,
  SendAudioDto,
  SendLocationDto,
  SendReactionDto,
  SendPollDto,
  SendContactDto,
} from '../validators/message.validator';

// ============================================================
// TIPOS DE RESPUESTA DE EVOLUTION API
// ============================================================

// Evolution API v2 retorna esta estructura al enviar un mensaje exitoso
export interface EvolutionMessageResponse {
  key: {
    remoteJid: string;   // "5215512345678@s.whatsapp.net"
    fromMe: boolean;     // true (lo enviamos nosotros)
    id: string;          // "BAE594145F4C59B4" — ID único del mensaje en WhatsApp
  };
  message: Record<string, unknown>;  // Contenido del mensaje según el tipo
  messageTimestamp: string | number;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'ERROR';
}

// ============================================================
// HELPERS
// ============================================================

/**
 * getInstanceOrThrow
 *
 * Busca la instancia en DB y lanza 404 si no existe.
 * Reutilizado en todos los métodos para evitar repetición.
 */
async function getInstanceOrThrow(instanceId: string) {
  const instance = await instanceRepository.findById(instanceId);
  if (!instance) {
    const err = new Error(`Instancia con ID "${instanceId}" no encontrada`);
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  return instance;
}

/**
 * extractEvolutionError
 *
 * Normaliza el error de Evolution API a un string legible.
 * Soporta el formato v2: { response: { message: ["..."] } }
 */
function extractEvolutionError(error: unknown): string {
  if (!axios.isAxiosError(error)) return String(error);
  const data = error.response?.data;
  if (!data) return error.message;
  if (data?.response?.message) {
    if (Array.isArray(data.response.message)) {
      // Evolution returns [{ jid, exists, number }] when the number has no WhatsApp
      const nonExistent = data.response.message.find((m: any) => m.exists === false);
      if (nonExistent) {
        return `El número ${nonExistent.number ?? nonExistent.jid} no tiene WhatsApp`;
      }
      return data.response.message.map((m: any) => JSON.stringify(m)).join(', ');
    }
    return String(data.response.message);
  }
  if (data?.message) return String(data.message);
  if (data?.error) return String(data.error);
  return JSON.stringify(data);
}

/**
 * normalizeNumber
 *
 * Evolution API acepta el número con o sin @s.whatsapp.net.
 * Lo dejamos pasar tal cual — si el usuario ya incluyó el sufijo, OK.
 * Solo dígitos → Evolution API los normaliza internamente.
 *
 * FORMATO CORRECTO:
 *   "5215512345678"              → número personal
 *   "5215512345678@s.whatsapp.net" → número personal (explícito)
 *   "120363xxxxxx@g.us"          → grupo
 */
function normalizeNumber(number: string): string {
  return number; // Evolution API maneja la normalización
}

// ============================================================
// HELPER: Guarda mensaje enviado en la DB inmediatamente
// (sin esperar al webhook de Evolution API)
// ============================================================

async function saveSentMessage(
  instanceId: string,
  instanceName: string,
  number: string,
  content: string,
  msgType: string,
  evolutionResponse: EvolutionMessageResponse,
): Promise<void> {
  try {
    const remoteJid = evolutionResponse.key?.remoteJid
      ?? (number.includes('@') ? number : `${number.replace(/\D/g, '')}@s.whatsapp.net`);
    const messageId = evolutionResponse.key?.id;
    if (!messageId) return;

    const isGroup  = remoteJid.includes('@g.us');
    const phone    = isGroup ? null : remoteJid.replace(/@.*/, '');
    const ts       = evolutionResponse.messageTimestamp
      ? new Date(Number(evolutionResponse.messageTimestamp) * 1000)
      : new Date();

    const contact = await prisma.contact.upsert({
      where: { instanceId_remoteJid: { instanceId, remoteJid } },
      update: { lastMessage: content, lastMessageAt: ts },
      create: { instanceId, remoteJid, phone, isGroup, lastMessage: content, lastMessageAt: ts, unreadCount: 0 },
    });

    await prisma.message.upsert({
      where: { instanceId_messageId: { instanceId, messageId } },
      update: {},
      create: {
        instanceId,
        contactId:  contact.id,
        remoteJid,
        messageId,
        fromMe:     true,
        type:       msgType,
        content,
        status:     'SENT',
        timestamp:  ts,
      },
    });

    logger.debug(`💾 Mensaje enviado guardado en DB | instanceId: ${instanceId} | messageId: ${messageId}`);
  } catch (err: any) {
    // No lanzar — guardar en DB es best-effort, no debe fallar el envío
    logger.warn(`⚠️ No se pudo guardar mensaje enviado en DB: ${err.message}`, { instanceName, number });
  }
}

// ============================================================
// SERVICIO DE MENSAJES
// ============================================================

class MessageService {

  // ----------------------------------------------------------
  // sendText
  // POST /message/sendText/{instanceName}
  // ----------------------------------------------------------
  /**
   * Envía un mensaje de texto plano.
   *
   * PARÁMETROS CLAVE:
   *  number      → Número destino (con código de país, sin +)
   *  text        → Contenido del mensaje (máx 4096 chars)
   *  delay       → Simula "escribiendo..." antes de enviar (ms)
   *  linkPreview → Genera vista previa si el texto contiene URL
   *  quoted      → Responde a un mensaje previo (reply)
   */
  async sendText(instanceId: string, data: SendTextDto): Promise<EvolutionMessageResponse> {
    const instance = await getInstanceOrThrow(instanceId);

    const payload = {
      number: normalizeNumber(data.number),
      text: data.text,
      delay: data.delay ?? 0,
      linkPreview: data.linkPreview ?? true,
      ...(data.quoted && { quoted: data.quoted }),
    };

    logger.info(`Sending text message | instance=${instance.name} | to=${data.number} | payload=${JSON.stringify(payload)}`);

    try {
      const response = await evolutionApi
        .getInstance()
        .post(`/message/sendText/${instance.name}`, payload);

      logger.info('Text message sent', {
        instanceName: instance.name,
        to: data.number,
        messageId: response.data?.key?.id,
      });

      // Guardar mensaje en DB inmediatamente (sin esperar al webhook)
      await saveSentMessage(instanceId, instance.name, data.number, data.text, 'conversation', response.data);

      return response.data;
    } catch (error) {
      this.handleSendError(error, 'sendText', instance.name, data.number);
    }
  }

  // ----------------------------------------------------------
  // sendMedia
  // POST /message/sendMedia/{instanceName}
  // ----------------------------------------------------------
  /**
   * Envía imagen, video, documento o audio como archivo adjunto.
   *
   * TIPOS VÁLIDOS:
   *  image    → JPG, PNG, GIF, WEBP — muestra preview inline
   *  video    → MP4, AVI — muestra reproductor inline
   *  document → PDF, DOCX, XLSX, etc. — aparece como archivo descargable
   *  audio    → MP3, OGG — aparece como archivo de audio (NO nota de voz)
   *             Para nota de voz, usar sendAudio()
   *
   * FUENTES SOPORTADAS:
   *  URL pública:  "https://ejemplo.com/imagen.jpg"
   *  Base64:       "data:image/jpeg;base64,/9j/4AAQ..."
   */
  async sendMedia(instanceId: string, data: SendMediaDto): Promise<EvolutionMessageResponse> {
    const instance = await getInstanceOrThrow(instanceId);

    const payload = {
      number: normalizeNumber(data.number),
      mediatype: data.mediatype,
      media: data.media,
      ...(data.caption && { caption: data.caption }),
      ...(data.fileName && { fileName: data.fileName }),
      delay: data.delay ?? 0,
      ...(data.quoted && { quoted: data.quoted }),
    };

    logger.debug('Sending media message', {
      instanceName: instance.name,
      to: data.number,
      mediatype: data.mediatype,
    });

    try {
      const response = await evolutionApi
        .getInstance()
        .post(`/message/sendMedia/${instance.name}`, payload);

      logger.info('Media message sent', {
        instanceName: instance.name,
        to: data.number,
        mediatype: data.mediatype,
        messageId: response.data?.key?.id,
      });

      const content = data.caption ?? `[${data.mediatype}]`;
      const msgType = `${data.mediatype}Message`;
      await saveSentMessage(instanceId, instance.name, data.number, content, msgType, response.data);

      return response.data;
    } catch (error) {
      this.handleSendError(error, 'sendMedia', instance.name, data.number);
    }
  }

  // ----------------------------------------------------------
  // sendAudio
  // POST /message/sendWhatsAppAudio/{instanceName}
  // ----------------------------------------------------------
  /**
   * Envía una nota de voz (PTT — Push To Talk).
   *
   * DIFERENCIA CON sendMedia tipo audio:
   *  sendMedia audio → aparece como archivo MP3 descargable
   *  sendAudio       → aparece como nota de voz con forma de onda ))))
   *                    El receptor escucha con el icono de auricular
   *
   * FORMATOS SOPORTADOS: MP3, OGG, M4A
   * El archivo se convierte automáticamente a OGG opus internamente.
   */
  async sendAudio(instanceId: string, data: SendAudioDto): Promise<EvolutionMessageResponse> {
    const instance = await getInstanceOrThrow(instanceId);

    const payload = {
      number: normalizeNumber(data.number),
      audio: data.audio,
      delay: data.delay ?? 0,
      ...(data.quoted && { quoted: data.quoted }),
    };

    try {
      const response = await evolutionApi
        .getInstance()
        .post(`/message/sendWhatsAppAudio/${instance.name}`, payload);

      logger.info('Audio message sent', {
        instanceName: instance.name,
        to: data.number,
        messageId: response.data?.key?.id,
      });

      return response.data;
    } catch (error) {
      this.handleSendError(error, 'sendWhatsAppAudio', instance.name, data.number);
    }
  }

  // ----------------------------------------------------------
  // sendLocation
  // POST /message/sendLocation/{instanceName}
  // ----------------------------------------------------------
  /**
   * Envía una ubicación geográfica.
   * Aparece como tarjeta de mapa interactivo en WhatsApp.
   *
   * IMPORTANTE: WhatsApp muestra el mapa solo si latitude y longitude
   * son coordenadas válidas. El campo "name" y "address" son opcionales
   * pero mejoran la presentación visual.
   */
  async sendLocation(instanceId: string, data: SendLocationDto): Promise<EvolutionMessageResponse> {
    const instance = await getInstanceOrThrow(instanceId);

    const payload = {
      number: normalizeNumber(data.number),
      latitude: data.latitude,
      longitude: data.longitude,
      ...(data.name && { name: data.name }),
      ...(data.address && { address: data.address }),
      delay: data.delay ?? 0,
    };

    try {
      const response = await evolutionApi
        .getInstance()
        .post(`/message/sendLocation/${instance.name}`, payload);

      logger.info('Location message sent', {
        instanceName: instance.name,
        to: data.number,
        coordinates: `${data.latitude},${data.longitude}`,
      });

      return response.data;
    } catch (error) {
      this.handleSendError(error, 'sendLocation', instance.name, data.number);
    }
  }

  // ----------------------------------------------------------
  // sendReaction
  // POST /message/sendReaction/{instanceName}
  // ----------------------------------------------------------
  /**
   * Agrega o remueve una reacción emoji a un mensaje previo.
   *
   * PARA AGREGAR: reaction = "❤️" (cualquier emoji)
   * PARA REMOVER: reaction = "" (string vacío)
   *
   * REQUIERE: key.id del mensaje al que reaccionas.
   * Puedes obtenerlo del webhook MESSAGES_UPSERT en req.body.data.key.id
   */
  async sendReaction(instanceId: string, data: SendReactionDto): Promise<EvolutionMessageResponse> {
    const instance = await getInstanceOrThrow(instanceId);

    const payload = {
      key: data.key,
      reaction: data.reaction,
    };

    try {
      const response = await evolutionApi
        .getInstance()
        .post(`/message/sendReaction/${instance.name}`, payload);

      logger.info('Reaction sent', {
        instanceName: instance.name,
        messageId: data.key.id,
        reaction: data.reaction || '(removed)',
      });

      return response.data;
    } catch (error) {
      this.handleSendError(error, 'sendReaction', instance.name, data.key.remoteJid);
    }
  }


  // ----------------------------------------------------------
  // sendPoll
  // POST /message/sendPoll/{instanceName}
  //
  // Encuesta nativa de WhatsApp — reemplazo gratuito de botones.
  // Cuando el usuario vota, Evolution dispara MESSAGES_UPSERT con
  // pollUpdateMessage, permitiendo automatizar respuestas por opción.
  //
  // selectableCount: 1 = radio (único), >1 = checkbox (múltiple)
  // ----------------------------------------------------------
  async sendPoll(instanceId: string, data: SendPollDto): Promise<EvolutionMessageResponse> {
    const instance = await getInstanceOrThrow(instanceId);

    const payload = {
      number:          normalizeNumber(data.number),
      name:            data.name,
      values:          data.values,
      selectableCount: data.selectableCount ?? 1,
      delay:           data.delay ?? 0,
    };

    logger.debug('Sending poll', {
      instanceName: instance.name,
      to:           data.number,
      question:     data.name,
      options:      data.values.length,
    });

    try {
      const response = await evolutionApi
        .getInstance()
        .post(`/message/sendPoll/${instance.name}`, payload);

      logger.info('Poll sent', {
        instanceName: instance.name,
        to:           data.number,
        question:     data.name,
        messageId:    response.data?.key?.id,
      });

      return response.data;
    } catch (error) {
      this.handleSendError(error, 'sendPoll', instance.name, data.number);
    }
  }

  // ----------------------------------------------------------
  // sendContact
  // POST /message/sendContact/{instanceName}
  //
  // Envía una o varias tarjetas vCard. El receptor puede guardar
  // el contacto con un solo tap — ideal para cierres de ventas.
  //
  // Si phoneNumber se omite, Evolution lo construye desde wuid.
  // ----------------------------------------------------------
  async sendContact(instanceId: string, data: SendContactDto): Promise<EvolutionMessageResponse> {
    const instance = await getInstanceOrThrow(instanceId);

    const contacts = data.contact.map((c) => ({
      fullName: c.fullName,
      wuid:     c.wuid,
      phoneNumber: c.phoneNumber ?? {
        wuid:   c.wuid,
        number: `+${c.wuid}`,
      },
    }));

    const payload = {
      number:  normalizeNumber(data.number),
      contact: contacts,
      delay:   data.delay ?? 0,
    };

    logger.debug('Sending contact card', {
      instanceName: instance.name,
      to:           data.number,
      contacts:     contacts.map((c) => c.fullName),
    });

    try {
      const response = await evolutionApi
        .getInstance()
        .post(`/message/sendContact/${instance.name}`, payload);

      logger.info('Contact card sent', {
        instanceName: instance.name,
        to:           data.number,
        contacts:     contacts.map((c) => c.fullName),
        messageId:    response.data?.key?.id,
      });

      return response.data;
    } catch (error) {
      this.handleSendError(error, 'sendContact', instance.name, data.number);
    }
  }
  // ----------------------------------------------------------
  // MANEJO DE ERRORES CENTRALIZADO
  // ----------------------------------------------------------
  /**
   * handleSendError
   *
   * Maneja errores de Evolution API de forma consistente para todos los métodos.
   *
   * ERRORES COMUNES:
   *  400 "instance requires property number" → number mal formateado
   *  400 "number is not whatsapp"            → número no tiene WhatsApp
   *  401 Unauthorized                        → apiKey de Evolution inválida
   *  404 Not Found                           → instancia no existe en Evolution
   *  503 Service Unavailable                 → Evolution API caída
   */
  private handleSendError(
    error: unknown,
    endpoint: string,
    instanceName: string,
    recipient: string
  ): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const evolutionError = error.response?.data;
      const humanMessage = extractEvolutionError(error);

      logger.error(`Evolution API ${endpoint} failed | status=${status} | recipient=${recipient} | evolutionError=${JSON.stringify(evolutionError)}`);

      // Errores específicos con mensajes claros para el usuario final
      if (status === 400) {
        const appError = new Error(`Envío rechazado: ${humanMessage}`);
        (appError as any).statusCode = 400;
        (appError as any).code = 'SEND_REJECTED';
        throw appError;
      }

      if (status === 401) {
        const appError = new Error('API Key de Evolution inválida. Verifica tu configuración.');
        (appError as any).statusCode = 502;
        (appError as any).code = 'EVOLUTION_AUTH_ERROR';
        throw appError;
      }

      if (status === 404) {
        const appError = new Error(
          `La instancia "${instanceName}" no existe en Evolution API. Puede haberse desconectado.`
        );
        (appError as any).statusCode = 404;
        (appError as any).code = 'INSTANCE_NOT_FOUND_IN_EVOLUTION';
        throw appError;
      }

      const appError = new Error(`Error enviando mensaje: ${humanMessage}`);
      (appError as any).statusCode = 502;
      (appError as any).code = 'EVOLUTION_API_ERROR';
      throw appError;
    }

    throw error;
  }
}

export const messageService = new MessageService();
export default messageService;