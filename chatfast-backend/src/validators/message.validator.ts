import { z } from 'zod';

// ============================================================
// SCHEMAS BASE REUTILIZABLES
// ============================================================

// Número de WhatsApp — Evolution API acepta:
// - Solo dígitos: "5215512345678"
// - Con @s.whatsapp.net: "5215512345678@s.whatsapp.net"
// - Grupos con @g.us: "120363xxxxxx@g.us"
const phoneNumberSchema = z
  .string()
  .min(10, 'Número muy corto. Incluye código de país. Ej: 5215512345678')
  .regex(
    /^[\d]+(@s\.whatsapp\.net|@g\.us)?$/,
    'Formato inválido. Usa solo dígitos o agrega @s.whatsapp.net'
  );

// Mensaje cotizado (reply a un mensaje previo)
const quotedSchema = z
  .object({
    key: z.object({
      id: z.string().min(1, 'Se requiere el ID del mensaje a citar'),
    }),
    message: z.object({
      conversation: z.string().optional(),
    }),
  })
  .optional();

// ============================================================
// SEND TEXT
// POST /message/sendText/{instance}
// ============================================================
export const sendTextSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid('instanceId debe ser UUID v4'),
  }),
  body: z.object({
    number: phoneNumberSchema,
    text: z
      .string()
      .min(1, 'El texto no puede estar vacío')
      .max(4096, 'Máximo 4096 caracteres (límite de WhatsApp)'),
    delay: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .optional()
      .describe('Delay en ms antes de enviar (simula escritura). Máx: 10000ms'),
    linkPreview: z.boolean().optional().default(true),
    quoted: quotedSchema,
  }),
});

// ============================================================
// SEND MEDIA (imagen, video, documento)
// POST /message/sendMedia/{instance}
// ============================================================
export const sendMediaSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    number: phoneNumberSchema,
    mediatype: z.enum(['image', 'video', 'document', 'audio'], {
      errorMap: () => ({ message: 'mediatype debe ser: image, video, document o audio' }),
    }),
    // URL pública o base64 del archivo
    // Evolution API acepta ambos formatos
    media: z
      .string()
      .min(1, 'Se requiere la URL o base64 del archivo')
      .describe('URL pública (https://...) o base64 del archivo'),
    caption: z
      .string()
      .max(1024)
      .optional()
      .describe('Texto descriptivo (solo para image y video)'),
    fileName: z
      .string()
      .optional()
      .describe('Nombre del archivo (requerido para document)'),
    delay: z.number().int().min(0).max(10000).optional(),
    quoted: quotedSchema,
  }),
});

// ============================================================
// SEND WHATSAPP AUDIO (nota de voz — ptt)
// POST /message/sendWhatsAppAudio/{instance}
// Diferencia con sendMedia tipo audio:
//   sendMedia → archivo de audio normal (MP3, etc.)
//   sendWhatsAppAudio → aparece como nota de voz con forma de onda
// ============================================================
export const sendAudioSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    number: phoneNumberSchema,
    audio: z
      .string()
      .min(1)
      .describe('URL pública del audio (MP3/OGG) o base64'),
    delay: z.number().int().min(0).max(10000).optional(),
    quoted: quotedSchema,
  }),
});

// ============================================================
// SEND LOCATION
// POST /message/sendLocation/{instance}
// ============================================================
export const sendLocationSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    number: phoneNumberSchema,
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe('Latitud. Ej: 19.4326'),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe('Longitud. Ej: -99.1332'),
    name: z
      .string()
      .optional()
      .describe('Nombre del lugar. Ej: Ciudad de México'),
    address: z
      .string()
      .optional()
      .describe('Dirección completa. Ej: Zócalo, Centro Histórico'),
    delay: z.number().int().min(0).max(10000).optional(),
  }),
});

// ============================================================
// SEND REACTION
// POST /message/sendReaction/{instance}
// ============================================================
export const sendReactionSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    key: z.object({
      remoteJid: z.string().min(1, 'Se requiere remoteJid del mensaje'),
      fromMe: z.boolean(),
      id: z.string().min(1, 'Se requiere ID del mensaje'),
    }),
    reaction: z
      .string()
      .emoji('Debe ser un emoji válido')
      .describe('Emoji de reacción. Enviar "" para remover la reacción'),
  }),
});

// ============================================================
// CHAT / PRESENCE (Simulador de Humano)
// ============================================================
export const sendPresenceSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    number: phoneNumberSchema,
    presence: z.enum(['composing', 'recording', 'paused'], {
      errorMap: () => ({ message: 'presence debe ser: composing, recording o paused' }),
    }),
    delay: z.number().int().min(0).max(60000).optional()
      .describe('Tiempo en milisegundos que durará el estado (ej: 5000 = 5 segundos)'),
  }),
});

export const markReadSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    readMessages: z.array(
      z.object({
        remoteJid: z.string().min(1),
        fromMe: z.boolean(),
        id: z.string().min(1),
      })
    ).min(1, 'Debes enviar al menos un mensaje para marcar como leído'),
  }),
});

export type SendPresenceDto = z.infer<typeof sendPresenceSchema>['body'];
export type MarkReadDto = z.infer<typeof markReadSchema>['body'];

// ============================================================
// TIPOS INFERIDOS DE ZOD
// ============================================================
export type SendTextDto = z.infer<typeof sendTextSchema>['body'];
export type SendMediaDto = z.infer<typeof sendMediaSchema>['body'];
export type SendAudioDto = z.infer<typeof sendAudioSchema>['body'];
export type SendLocationDto = z.infer<typeof sendLocationSchema>['body'];
export type SendReactionDto = z.infer<typeof sendReactionSchema>['body'];

// ============================================================
// SEND POLL (Encuesta — reemplazo gratuito de botones interactivos)
// POST /message/sendPoll/{instance}
//
// Por qué Polls en vez de botones:
//   Meta restringió los botones interactivos a plantillas de pago.
//   Los Polls son gratuitos, nativos de WhatsApp y disparan webhook
//   MESSAGES_UPSERT con pollUpdateMessage cuando el usuario vota,
//   permitiendo automatizar respuestas basadas en la elección.
// ============================================================
export const sendPollSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid('instanceId debe ser UUID v4'),
  }),
  body: z.object({
    number: phoneNumberSchema,
    name: z
      .string()
      .min(1, 'La pregunta no puede estar vacía')
      .max(255, 'Máximo 255 caracteres para la pregunta'),
    values: z
      .array(z.string().min(1).max(100))
      .min(2, 'Mínimo 2 opciones')
      .max(12, 'Máximo 12 opciones (límite de WhatsApp)'),
    selectableCount: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .default(1)
      .describe('1 = selección única (radio). >1 = selección múltiple (checkbox).'),
    delay: z.number().int().min(0).max(10000).optional(),
  }),
});

// ============================================================
// SEND CONTACT (Tarjeta vCard)
// POST /message/sendContact/{instance}
//
// Por qué es valioso:
//   El receptor guarda el contacto con un solo tap en lugar de
//   teclear el número manualmente. Ideal para cierres de ventas.
//
// Evolution API v2 acepta array de contactos (multi-vCard).
// ============================================================
export const sendContactSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid('instanceId debe ser UUID v4'),
  }),
  body: z.object({
    number: phoneNumberSchema,
    contact: z
      .array(
        z.object({
          fullName: z
            .string()
            .min(1, 'El nombre del contacto es requerido')
            .max(100),
          wuid: z
            .string()
            .min(10, 'Número WhatsApp del contacto con código de país')
            .describe('Sin @s.whatsapp.net. Ej: 5215512345678'),
          phoneNumber: z
            .object({
              wuid:   z.string().min(10),
              number: z.string().min(10).describe('Con + para la vCard. Ej: +5215512345678'),
            })
            .optional()
            .describe('Si omites, Evolution usa wuid automáticamente'),
        })
      )
      .min(1, 'Se requiere al menos un contacto')
      .max(5, 'Máximo 5 contactos por mensaje'),
    delay: z.number().int().min(0).max(10000).optional(),
  }),
});

export type SendPollDto    = z.infer<typeof sendPollSchema>['body'];
export type SendContactDto = z.infer<typeof sendContactSchema>['body'];