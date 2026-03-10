/**
 * ============================================================
 * middleware/ownership.ts — Multi-tenant ownership guard
 * ============================================================
 * Verifica que la instancia solicitada pertenece al usuario
 * autenticado. ADMIN hace bypass automático.
 *
 * Uso en routes:
 *   router.use(authenticate, requireOwnership())
 *   router.use(authenticate, requireOwnership('id'))  // cuando el param se llama :id
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { ApiResponder } from '../utils/apiResponse';
import { HttpStatus, ErrorCode } from '../types/api.types';
import { logger } from '../config/logger';

export function requireOwnership(paramName = 'instanceId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;

      // ADMIN siempre tiene acceso a todo
      if (user.role === 'ADMIN') {
        return next();
      }

      const instanceId = req.params[paramName];

      if (!instanceId) {
        ApiResponder.error(
          res,
          'ID de instancia requerido',
          ErrorCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST
        );
        return;
      }

      const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        select: { id: true, clientId: true, name: true },
      });

      if (!instance) {
        ApiResponder.error(
          res,
          'Instancia no encontrada',
          ErrorCode.NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
        return;
      }

      if (instance.clientId !== user.id) {
        logger.warn('Acceso multi-tenant denegado', {
          userId: user.id,
          instanceId,
          instanceClientId: instance.clientId,
        });
        ApiResponder.error(
          res,
          'No tienes permiso para acceder a esta instancia',
          ErrorCode.FORBIDDEN,
          HttpStatus.FORBIDDEN
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export default requireOwnership;
