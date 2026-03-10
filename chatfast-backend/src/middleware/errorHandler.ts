import { Request, Response, NextFunction } from 'express';
import { ApiResponder } from '../utils/apiResponse';
import { HttpStatus, ErrorCode } from '../types/api.types';
import { logger } from '../config/logger';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class AppError extends Error {
  statusCode: HttpStatus;
  code: ErrorCode;
  isOperational: boolean;

  constructor(message: string, statusCode: HttpStatus, code: ErrorCode) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error('Error caught by errorHandler', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: res.locals.requestId,
  });

  if (err instanceof ZodError) {
    ApiResponder.error(
      res,
      'Error de validación',
      ErrorCode.VALIDATION_ERROR,
      HttpStatus.BAD_REQUEST,
      err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }))
    );
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      ApiResponder.error(res, 'Recurso duplicado', ErrorCode.DUPLICATE, HttpStatus.CONFLICT);
      return;
    }
    if (err.code === 'P2025') {
      ApiResponder.error(res, 'Recurso no encontrado', ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      return;
    }
  }

  if (err instanceof AppError && err.isOperational) {
    ApiResponder.error(res, err.message, err.code, err.statusCode);
    return;
  }

  ApiResponder.error(res, 'Error interno del servidor', ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
};

export default errorHandler;