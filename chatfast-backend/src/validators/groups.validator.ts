import { z } from 'zod';

// ============================================================
// SCHEMAS BASE REUTILIZABLES
// ============================================================

const phoneNumberSchema = z
  .string()
  .min(10, 'Número muy corto. Incluye código de país.')
  .regex(
    /^[\d]+(@s\.whatsapp\.net|@g\.us)?$/,
    'Formato inválido. Usa solo dígitos o agrega @s.whatsapp.net'
  );

// JID de grupo — siempre termina en @g.us
const groupJidSchema = z
  .string()
  .min(1, 'Se requiere el JID del grupo')
  .refine(
    (val) => val.endsWith('@g.us') || /^\d+$/.test(val),
    'El JID del grupo debe terminar en @g.us. Ej: 120363xxxxxx@g.us'
  );

// ============================================================
// CREATE GROUP
// POST /group/create/{instance}
// ============================================================
export const createGroupSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid('instanceId debe ser UUID v4'),
  }),
  body: z.object({
    subject: z
      .string()
      .min(1, 'El nombre del grupo es requerido')
      .max(100, 'Máximo 100 caracteres para el nombre del grupo'),
    description: z
      .string()
      .max(512, 'Máximo 512 caracteres para la descripción')
      .optional(),
    participants: z
      .array(phoneNumberSchema)
      .min(1, 'Se requiere al menos 1 participante')
      .max(256, 'Máximo 256 participantes por grupo'),
  }),
});

// ============================================================
// UPDATE GROUP SUBJECT (nombre)
// PUT /group/updateGroupSubject/{instance}
// ============================================================
export const updateGroupSubjectSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    groupJid: groupJidSchema,
    subject: z
      .string()
      .min(1, 'El nombre no puede estar vacío')
      .max(100, 'Máximo 100 caracteres'),
  }),
});

// ============================================================
// UPDATE GROUP DESCRIPTION
// PUT /group/updateGroupDescription/{instance}
// ============================================================
export const updateGroupDescriptionSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    groupJid:    groupJidSchema,
    description: z.string().max(512, 'Máximo 512 caracteres').optional().default(''),
  }),
});

// ============================================================
// UPDATE GROUP PICTURE
// PUT /group/updateGroupPicture/{instance}
// ============================================================
export const updateGroupPictureSchema = z.object({
  params: z.object({
    instanceId: z.string().uuid(),
  }),
  body: z.object({
    groupJid: groupJidSchema,
    image: z
      .string()
      .min(1, 'Se requiere la URL pública o base64 de la imagen')
      .describe('URL pública (https://...) o base64 de la imagen'),
  }),
});

// ============================================================
// ADD / REMOVE / PROMOTE / DEMOTE PARTICIPANTS
// ============================================================

const participantsBodySchema = z.object({
  groupJid: groupJidSchema,
  participants: z
    .array(phoneNumberSchema)
    .min(1, 'Se requiere al menos 1 participante')
    .max(50, 'Máximo 50 participantes por operación'),
});

export const addParticipantsSchema = z.object({
  params: z.object({ instanceId: z.string().uuid() }),
  body:   participantsBodySchema,
});

export const removeParticipantsSchema = z.object({
  params: z.object({ instanceId: z.string().uuid() }),
  body:   participantsBodySchema,
});

export const promoteParticipantsSchema = z.object({
  params: z.object({ instanceId: z.string().uuid() }),
  body:   participantsBodySchema,
});

export const demoteParticipantsSchema = z.object({
  params: z.object({ instanceId: z.string().uuid() }),
  body:   participantsBodySchema,
});

// ============================================================
// GET INVITE CODE / REVOKE INVITE CODE
// GET  /group/inviteCode/{instance}?groupJid=...
// GET  /group/revokeInviteCode/{instance}?groupJid=...
// ============================================================
export const groupJidParamSchema = z.object({
  params: z.object({ instanceId: z.string().uuid() }),
  query:  z.object({
    groupJid: groupJidSchema,
  }),
});

// ============================================================
// LEAVE GROUP
// DELETE /group/leaveGroup/{instance}
// ============================================================
export const leaveGroupSchema = z.object({
  params: z.object({ instanceId: z.string().uuid() }),
  body:   z.object({ groupJid: groupJidSchema }),
});

// ============================================================
// TIPOS INFERIDOS
// ============================================================
export type CreateGroupDto            = z.infer<typeof createGroupSchema>['body'];
export type UpdateGroupSubjectDto     = z.infer<typeof updateGroupSubjectSchema>['body'];
export type UpdateGroupDescriptionDto = z.infer<typeof updateGroupDescriptionSchema>['body'];
export type UpdateGroupPictureDto     = z.infer<typeof updateGroupPictureSchema>['body'];
export type AddParticipantsDto        = z.infer<typeof addParticipantsSchema>['body'];
export type RemoveParticipantsDto     = z.infer<typeof removeParticipantsSchema>['body'];
export type PromoteParticipantsDto    = z.infer<typeof promoteParticipantsSchema>['body'];
export type DemoteParticipantsDto     = z.infer<typeof demoteParticipantsSchema>['body'];