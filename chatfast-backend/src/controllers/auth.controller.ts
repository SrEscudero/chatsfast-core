import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { ApiResponder } from '../utils/apiResponse';
import { HttpStatus, ErrorCode } from '../types/api.types';
import { AppError } from '../errors/AppError';
import { asyncHandler } from '../utils/asyncHandler';

function handleAuthError(res: Response, error: unknown): void {
  if (error instanceof AppError) {
    ApiResponder.error(res, error.message, error.code, error.statusCode as HttpStatus);
    return;
  }
  ApiResponder.error(res, 'Error interno del servidor', ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
}

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    try {
      const client = await authService.register(req.body);
      ApiResponder.created(res, client, 'Cuenta creada exitosamente');
    } catch (error) {
      handleAuthError(res, error);
    }
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await authService.login(req.body);
      ApiResponder.success(res, result, 'Login exitoso');
    } catch (error) {
      handleAuthError(res, error);
    }
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refresh(refreshToken);
      ApiResponder.success(res, result, 'Token renovado');
    } catch (error) {
      handleAuthError(res, error);
    }
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      await authService.logout(refreshToken);
      ApiResponder.success(res, null, 'Sesión cerrada');
    } catch (error) {
      handleAuthError(res, error);
    }
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const client = await authService.me(userId);
      ApiResponder.success(res, client);
    } catch (error) {
      handleAuthError(res, error);
    }
  }),
};
