/**
 * middleware/rateLimiter.ts
 *
 * CORRECCIÓN: express-rate-limit v7+ requiere usar el helper `ipKeyGenerator`
 * cuando se quiere incluir la IP del cliente en el keyGenerator.
 * Sin esto, usuarios IPv6 podían evadir el límite.
 *
 * REFERENCIA: https://express-rate-limit.github.io/ERR_ERL_KEY_GEN_IPV6/
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * rateLimiter — uso general
 * 60 peticiones por minuto por IP+userId.
 * Usar en rutas de lectura/escritura estándar.
 */
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,

  // ipKeyGenerator maneja correctamente IPv4 e IPv6
  // Sin este helper, IPs IPv6 podían evadir el límite usando variantes de la misma IP
  keyGenerator: (req: Request): string => {
    const userId = (req as any).user?.id ?? 'anonymous';
    const ip = ipKeyGenerator(req); // ✅ correcto para IPv4 e IPv6
    return `${ip}:${userId}`;
  },

  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Demasiadas solicitudes. Límite: 60 por minuto.',
      },
    });
  },
});

/**
 * strictRateLimiter — endpoints sensibles (ej: generación de QR)
 * 5 peticiones cada 5 minutos por instancia+userId.
 */
export const strictRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: Request): string => {
    const userId = (req as any).user?.id ?? 'anonymous';
    const instanceId = req.params.id ?? 'unknown';
    // No usamos IP aquí — el límite es por instancia específica
    return `qr:${instanceId}:${userId}`;
  },

  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'QR_RATE_LIMIT_EXCEEDED',
        message: 'Máximo 5 solicitudes de QR por instancia cada 5 minutos.',
      },
    });
  },
});