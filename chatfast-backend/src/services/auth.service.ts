import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';
import { RegisterDto, LoginDto } from '../validators/auth.validator';

// ============================================================
// HELPERS
// ============================================================

function signAccessToken(payload: { id: string; email: string; role: string }): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function signRefreshToken(payload: { id: string }): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function refreshTokenExpiresAt(): Date {
  // Parse the JWT_REFRESH_EXPIRES_IN (e.g. "7d") into a Date
  const raw = config.JWT_REFRESH_EXPIRES_IN;
  const match = raw.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN format: ${raw}`);
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return new Date(Date.now() + amount * ms);
}

const SALT_ROUNDS = 12;

// ============================================================
// SERVICE
// ============================================================

export const authService = {
  async register(dto: RegisterDto) {
    const existing = await prisma.client.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new AppError('DUPLICATE', 'Ya existe una cuenta con ese email', 409);
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const client = await prisma.client.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        phone: dto.phone,
      },
      select: { id: true, name: true, email: true, phone: true, role: true, plan: true, createdAt: true },
    });

    logger.info('Nuevo cliente registrado', { id: client.id, email: client.email });
    return client;
  },

  async login(dto: LoginDto) {
    const client = await prisma.client.findUnique({ where: { email: dto.email } });

    if (!client || !(await bcrypt.compare(dto.password, client.password))) {
      throw new AppError('UNAUTHORIZED', 'Credenciales incorrectas', 401);
    }

    if (client.suspended) {
      throw new AppError('FORBIDDEN', 'Cuenta suspendida. Contacta al administrador.', 403);
    }

    if (!client.active) {
      throw new AppError('FORBIDDEN', 'Cuenta inactiva.', 403);
    }

    const accessToken = signAccessToken({ id: client.id, email: client.email, role: client.role });
    const refreshToken = signRefreshToken({ id: client.id });

    await prisma.session.create({
      data: {
        userId: client.id,
        token: refreshToken,
        expiresAt: refreshTokenExpiresAt(),
      },
    });

    logger.info('Login exitoso', { id: client.id, email: client.email });

    return {
      accessToken,
      refreshToken,
      user: {
        id: client.id,
        name: client.name,
        email: client.email,
        role: client.role,
        plan: client.plan,
      },
    };
  },

  async refresh(refreshToken: string) {
    let payload: { id: string };
    try {
      payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as { id: string };
    } catch {
      throw new AppError('UNAUTHORIZED', 'Refresh token inválido o expirado', 401);
    }

    const session = await prisma.session.findUnique({ where: { token: refreshToken } });
    if (!session || session.expiresAt < new Date()) {
      throw new AppError('UNAUTHORIZED', 'Sesión no encontrada o expirada', 401);
    }

    const client = await prisma.client.findUnique({ where: { id: payload.id } });
    if (!client || client.suspended || !client.active) {
      throw new AppError('UNAUTHORIZED', 'Usuario no disponible', 401);
    }

    const newAccessToken = signAccessToken({ id: client.id, email: client.email, role: client.role });

    return { accessToken: newAccessToken };
  },

  async logout(refreshToken: string) {
    await prisma.session.deleteMany({ where: { token: refreshToken } });
    logger.info('Logout: sesión eliminada');
  },

  async me(userId: string) {
    const client = await prisma.client.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        plan: true,
        planExpiresAt: true,
        active: true,
        suspended: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!client) {
      throw new AppError('NOT_FOUND', 'Usuario no encontrado', 404);
    }

    return client;
  },
};
