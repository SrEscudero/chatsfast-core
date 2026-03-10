import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';
import { CreateClientDto, UpdateClientDto } from '../validators/client.validator';

const SALT_ROUNDS = 12;

// Campos seguros a devolver (nunca el password)
const safeSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  plan: true,
  planExpiresAt: true,
  active: true,
  suspended: true,
  suspendedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { instances: true } },
} as const;

export const clientService = {
  // ─── GET ALL (ADMIN only) ────────────────────────────────────────────────────
  async getAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: safeSelect,
      }),
      prisma.client.count(),
    ]);

    return {
      items: clients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  // ─── GET BY ID ───────────────────────────────────────────────────────────────
  async getById(id: string) {
    const client = await prisma.client.findUnique({
      where: { id },
      select: safeSelect,
    });

    if (!client) {
      throw new AppError('NOT_FOUND', 'Cliente no encontrado', 404);
    }

    return client;
  },

  // ─── CREATE (ADMIN only) ─────────────────────────────────────────────────────
  async create(dto: CreateClientDto) {
    const existing = await prisma.client.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new AppError('DUPLICATE', 'Ya existe un cliente con ese email', 409);
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const client = await prisma.client.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        phone: dto.phone,
        role: dto.role ?? 'CLIENT',
        plan: dto.plan ?? 'FREE',
        planExpiresAt: dto.planExpiresAt ? new Date(dto.planExpiresAt) : null,
      },
      select: safeSelect,
    });

    logger.info('Cliente creado por ADMIN', { id: client.id, email: client.email });
    return client;
  },

  // ─── UPDATE ──────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateClientDto) {
    // Verificar que existe
    await clientService.getById(id);

    // Si viene email nuevo, verificar que no esté duplicado
    if (dto.email) {
      const conflict = await prisma.client.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (conflict) {
        throw new AppError('DUPLICATE', 'El email ya está en uso por otro cliente', 409);
      }
    }

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.plan !== undefined) data.plan = dto.plan;
    if (dto.planExpiresAt !== undefined) {
      data.planExpiresAt = dto.planExpiresAt ? new Date(dto.planExpiresAt) : null;
    }
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password !== undefined) {
      data.password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    }

    const updated = await prisma.client.update({
      where: { id },
      data,
      select: safeSelect,
    });

    logger.info('Cliente actualizado', { id });
    return updated;
  },

  // ─── DELETE (ADMIN only) ─────────────────────────────────────────────────────
  async delete(id: string) {
    await clientService.getById(id);

    await prisma.client.delete({ where: { id } });
    logger.info('Cliente eliminado', { id });
  },

  // ─── SUSPEND (ADMIN only) ────────────────────────────────────────────────────
  async suspend(id: string) {
    const client = await clientService.getById(id);

    if (client.suspended) {
      throw new AppError('CONFLICT', 'El cliente ya está suspendido', 409);
    }

    const updated = await prisma.client.update({
      where: { id },
      data: { suspended: true, suspendedAt: new Date() },
      select: safeSelect,
    });

    // Invalidar todas sus sesiones activas
    await prisma.session.deleteMany({ where: { userId: id } });

    logger.warn('Cliente suspendido', { id });
    return updated;
  },

  // ─── REACTIVATE (ADMIN only) ─────────────────────────────────────────────────
  async reactivate(id: string) {
    const client = await clientService.getById(id);

    if (!client.suspended) {
      throw new AppError('CONFLICT', 'El cliente no está suspendido', 409);
    }

    const updated = await prisma.client.update({
      where: { id },
      data: { suspended: false, suspendedAt: null },
      select: safeSelect,
    });

    logger.info('Cliente reactivado', { id });
    return updated;
  },
};
