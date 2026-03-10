import { z } from 'zod';

export const createInstanceSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(3, 'El nombre debe tener al menos 3 caracteres')
      .max(50, 'El nombre debe tener máximo 50 caracteres')
      .regex(/^[a-zA-Z0-9_-]+$/, 'El nombre solo puede contener letras, números, guiones y guiones bajos'),
    clientId: z
      .string()
      .uuid('El clientId debe ser un UUID válido')
      .optional(), // Opcional: el controller lo fuerza para non-ADMIN
    connectionType: z
      .enum(['BAILEYS', 'WHATSAPP_CLOUD'])
      .optional()
      .default('BAILEYS'),
  }),
});

export const queryInstanceSchema = z.object({
  query: z.object({
    clientId: z.string().uuid().optional(),
    status: z.enum(['PENDING', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR']).optional(),
    connectionType: z.enum(['BAILEYS', 'WHATSAPP_CLOUD']).optional(),
    search: z.string().optional(),
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const instanceActionSchema = z.object({
  params: z.object({
    id: z.string().uuid('El ID debe ser un UUID válido'),
  }),
});

export const getInstanceSchema = z.object({
  params: z.object({
    id: z.string().uuid('El ID debe ser un UUID válido'),
  }),
});

export const updateInstanceSchema = z.object({
  params: z.object({
    id: z.string().uuid('El ID debe ser un UUID válido'),
  }),
  body: z.object({
    name: z.string().min(3).max(50).optional(),
    status: z.enum(['PENDING', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR']).optional(),
    config: z.record(z.any()).optional(),
  }),
});

export type CreateInstanceDto = z.infer<typeof createInstanceSchema>['body'];
export type UpdateInstanceDto = z.infer<typeof updateInstanceSchema>['body'];

export default {
  createInstanceSchema,
  getInstanceSchema,
  updateInstanceSchema,
  queryInstanceSchema,
  instanceActionSchema,
};