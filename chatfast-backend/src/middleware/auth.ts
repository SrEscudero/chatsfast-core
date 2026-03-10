/**
 * ============================================================
 * middleware/auth.ts - CHATFAST API (Kelvis Tech)
 * ============================================================
 * Middleware de autenticación JWT integrado con ApiResponder.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponder } from '../utils/apiResponse';
import { HttpStatus, ErrorCode } from '../types/api.types';
import { config } from '../config';
import { logger } from '../config/logger';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: 'ADMIN' | 'OPERATOR' | 'CLIENT';
        clientId?: string;
      };
    }
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // ==========================================================
  // 🚧 MODO DESARROLLO: BYPASS TEMPORAL
  // Elimina o comenta este bloque cuando programes el Login real
  // ==========================================================
  if (config.NODE_ENV === 'development') {
    logger.debug('⚠️ Auth bypass activo (Modo Desarrollo)');
    req.user = { 
      id: 'dev-user-id', 
      email: 'admin@kelvistech.com', 
      role: 'ADMIN' 
    };
    return next();
  }
  // ==========================================================

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ApiResponder.error(
        res,
        'Token de autenticación requerido. Header: Authorization: Bearer <token>',
        ErrorCode.UNAUTHORIZED,
        HttpStatus.UNAUTHORIZED
      );
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.JWT_SECRET) as Express.Request['user'];
    req.user = decoded;
    
    next();

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      ApiResponder.error(
        res,
        'El token ha expirado. Por favor inicia sesión nuevamente.',
        ErrorCode.UNAUTHORIZED,
        HttpStatus.UNAUTHORIZED
      );
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      ApiResponder.error(
        res,
        'Token inválido o malformado.',
        ErrorCode.UNAUTHORIZED,
        HttpStatus.UNAUTHORIZED
      );
      return;
    }

    next(error);
  }
};

export default authenticate;