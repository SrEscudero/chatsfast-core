/**
 * ============================================================
 * middleware/authorize.ts - CHATFAST API (Kelvis Tech)
 * ============================================================
 * Middleware de autorización por roles.
 */

import { Request, Response, NextFunction } from 'express';
import { ApiResponder } from '../utils/apiResponse';
import { HttpStatus, ErrorCode } from '../types/api.types';
import { logger } from '../config/logger';

export type Role = 'ADMIN' | 'OPERATOR' | 'CLIENT' | 'OWNER';

export const authorize = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 1. Verificar que authenticate corrió antes (req.user debe existir)
    if (!req.user) {
      logger.error('Intento de autorización sin usuario autenticado en req.user');
      ApiResponder.error(
        res,
        'Debes autenticarte antes de verificar permisos.',
        ErrorCode.UNAUTHORIZED,
        HttpStatus.UNAUTHORIZED
      );
      return;
    }

    const userRole = req.user.role as Role;

    // 2. Verificar si el rol del usuario está en la lista de permitidos
    if (!roles.includes(userRole)) {
      logger.warn('Acceso denegado por falta de permisos', {
        userId: req.user.id,
        userRole: userRole,
        requiredRoles: roles,
        path: req.path,
        method: req.method
      });

      ApiResponder.error(
        res,
        `Acceso denegado. Se requiere uno de estos roles: ${roles.join(', ')}.`,
        ErrorCode.FORBIDDEN,
        HttpStatus.FORBIDDEN
      );
      return;
    }

    // ✅ Tiene permiso -> continúa
    next();
  };
};

export default authorize;