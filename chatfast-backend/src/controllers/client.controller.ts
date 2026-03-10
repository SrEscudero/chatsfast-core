import { Request, Response } from 'express';
import { clientService } from '../services/client.service';
import { ApiResponder } from '../utils/apiResponse';
import { HttpStatus, ErrorCode } from '../types/api.types';
import { AppError } from '../errors/AppError';
import { asyncHandler } from '../utils/asyncHandler';

function handleError(res: Response, error: unknown): void {
  if (error instanceof AppError) {
    ApiResponder.error(res, error.message, error.code, error.statusCode as HttpStatus);
    return;
  }
  ApiResponder.error(res, 'Error interno del servidor', ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
}

export const clientController = {
  // GET /clients — ADMIN: todos | CLIENT: redirige a su propio perfil
  getAll: asyncHandler(async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'ADMIN') {
        // Un CLIENT no puede listar todos — solo puede ver el suyo
        const client = await clientService.getById(req.user!.id);
        return ApiResponder.success(res, { items: [client], pagination: { page: 1, limit: 1, total: 1, totalPages: 1 } });
      }

      const page  = Math.max(1, parseInt(req.query.page as string)  || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

      const result = await clientService.getAll(page, limit);
      ApiResponder.success(res, result);
    } catch (error) {
      handleError(res, error);
    }
  }),

  // GET /clients/:id
  getById: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // CLIENT solo puede ver su propio perfil
      if (req.user!.role !== 'ADMIN' && req.user!.id !== id) {
        return ApiResponder.error(res, 'No tienes permiso para ver este cliente', ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN);
      }

      const client = await clientService.getById(id);
      ApiResponder.success(res, client);
    } catch (error) {
      handleError(res, error);
    }
  }),

  // POST /clients — ADMIN only
  create: asyncHandler(async (req: Request, res: Response) => {
    try {
      const client = await clientService.create(req.body);
      ApiResponder.created(res, client, 'Cliente creado exitosamente');
    } catch (error) {
      handleError(res, error);
    }
  }),

  // PUT /clients/:id
  update: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const isAdmin = req.user!.role === 'ADMIN';

      // CLIENT solo puede editar su propio perfil
      if (!isAdmin && req.user!.id !== id) {
        return ApiResponder.error(res, 'No tienes permiso para editar este cliente', ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN);
      }

      // CLIENT no puede cambiar email, role, plan ni planExpiresAt
      const body = { ...req.body };
      if (!isAdmin) {
        delete body.email;
        delete body.role;
        delete body.plan;
        delete body.planExpiresAt;
        delete body.active;
      }

      const client = await clientService.update(id, body);
      ApiResponder.success(res, client, 'Cliente actualizado');
    } catch (error) {
      handleError(res, error);
    }
  }),

  // DELETE /clients/:id — ADMIN only
  delete: asyncHandler(async (req: Request, res: Response) => {
    try {
      await clientService.delete(req.params.id);
      ApiResponder.noContent(res);
    } catch (error) {
      handleError(res, error);
    }
  }),

  // POST /clients/:id/suspend — ADMIN only
  suspend: asyncHandler(async (req: Request, res: Response) => {
    try {
      const client = await clientService.suspend(req.params.id);
      ApiResponder.success(res, client, 'Cliente suspendido');
    } catch (error) {
      handleError(res, error);
    }
  }),

  // POST /clients/:id/reactivate — ADMIN only
  reactivate: asyncHandler(async (req: Request, res: Response) => {
    try {
      const client = await clientService.reactivate(req.params.id);
      ApiResponder.success(res, client, 'Cliente reactivado');
    } catch (error) {
      handleError(res, error);
    }
  }),
};
