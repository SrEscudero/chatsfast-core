import { z } from 'zod';

// ============================================================
// UPDATE PROFILE PICTURE
// PUT /chat/updateProfilePicture/{instance}
// ============================================================
export const updateProfilePictureSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid('instanceId debe ser UUID v4'),
  }),
  body: z.object({
    picture: z
      .string()
      .min(1, 'Se requiere la URL pública o base64 de la imagen')
      .describe('URL pública (https://...) o base64 de la imagen en formato JPG/PNG'),
  }),
});

// ============================================================
// UPDATE PROFILE NAME (PushName)
// POST /chat/updateProfileName/{instance}
// ============================================================
export const updateProfileNameSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    name: z
      .string()
      .min(1, 'El nombre no puede estar vacío')
      .max(25, 'Máximo 25 caracteres (límite de WhatsApp)'),
  }),
});

// ============================================================
// UPDATE PROFILE STATUS (Info/Bio)
// POST /chat/updateProfileStatus/{instance}
// ============================================================
export const updateProfileStatusSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    status: z
      .string()
      .min(0)
      .max(139, 'Máximo 139 caracteres (límite de WhatsApp)')
      .default(''),
  }),
});

// ============================================================
// REVOKE MESSAGE (Eliminar para todos)
// DELETE /message/delete/{instance}
// ============================================================
export const revokeMessageSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    key: z.object({
      remoteJid: z.string().min(1, 'Se requiere remoteJid'),
      fromMe:    z.boolean(),
      id:        z.string().min(1, 'Se requiere el ID del mensaje'),
    }),
  }),
});

// ============================================================
// TIPOS INFERIDOS
// ============================================================
export type UpdateProfilePictureDto = z.infer<typeof updateProfilePictureSchema>['body'];
export type UpdateProfileNameDto    = z.infer<typeof updateProfileNameSchema>['body'];
export type UpdateProfileStatusDto  = z.infer<typeof updateProfileStatusSchema>['body'];
export type RevokeMessageDto        = z.infer<typeof revokeMessageSchema>['body'];