import { z } from 'zod';

const clientIdParam = z.object({
  params: z.object({
    id: z.string().uuid('El id debe ser un UUID v4'),
  }),
});

// ADMIN crea un cliente manualmente (incluye password inicial)
export const createClientSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(100),
    phone: z.string().optional(),
    role: z.enum(['ADMIN', 'OPERATOR', 'CLIENT']).default('CLIENT'),
    plan: z.enum(['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE']).default('FREE'),
    planExpiresAt: z.string().datetime().optional(),
  }),
});

// ADMIN puede actualizar todo; CLIENT solo name/phone/password (se filtra en el controller)
export const updateClientSchema = z.object({
  params: z.object({
    id: z.string().uuid('El id debe ser un UUID v4'),
  }),
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    phone: z.string().optional(),
    password: z.string().min(8).max(100).optional(),
    // Solo ADMIN puede cambiar estos:
    email: z.string().email().optional(),
    role: z.enum(['ADMIN', 'OPERATOR', 'CLIENT']).optional(),
    plan: z.enum(['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE']).optional(),
    planExpiresAt: z.string().datetime().nullable().optional(),
    active: z.boolean().optional(),
  }),
});

export const clientParamSchema = clientIdParam;

export type CreateClientDto = z.infer<typeof createClientSchema>['body'];
export type UpdateClientDto = z.infer<typeof updateClientSchema>['body'];
