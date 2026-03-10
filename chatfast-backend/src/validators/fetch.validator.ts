import { z } from 'zod';

// ============================================================
// FETCH CONTACTS
// GET /chat/findContacts/{instance}
// ============================================================
export const fetchContactsSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid('instanceId debe ser UUID v4'),
  }),
});

// ============================================================
// FETCH CHATS (lista de conversaciones)
// GET /chat/findChats/{instance}
// ============================================================
export const fetchChatsSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
});

// ============================================================
// FETCH MESSAGES (historial de un chat específico)
// GET /chat/findMessages/{instance}
// ============================================================
export const fetchMessagesSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  query: z.object({
    remoteJid: z
      .string()
      .min(1, 'Se requiere el remoteJid del chat')
      .describe('JID del chat. Ej: 5215512345678@s.whatsapp.net o 120363xxx@g.us'),
    count: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 20))
      .pipe(z.number().int().min(1).max(100))
      .describe('Cantidad de mensajes a traer (default: 20, máx: 100)'),
  }),
});

// ============================================================
// TIPOS INFERIDOS
// ============================================================
export type FetchContactsDto = z.infer<typeof fetchContactsSchema>['params'];
export type FetchChatsDto    = z.infer<typeof fetchChatsSchema>['params'];
export type FetchMessagesDto = z.infer<typeof fetchMessagesSchema>['query'];