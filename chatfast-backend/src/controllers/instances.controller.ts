import { Request, Response, NextFunction } from 'express';
import { instanceService } from '../services/instances.service';
import { ApiResponder } from '../utils/apiResponse';
import { HttpStatus, ErrorCode } from '../types/api.types';
import { logger } from '../config/logger';
import { CreateInstanceDto } from '../validators/instance.validator';

class InstanceController {

  // ----------------------------------------------------------
  // POST /api/v1/instances
  // ----------------------------------------------------------
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data: CreateInstanceDto = { ...req.body };

      // Si el usuario no es ADMIN, forzar su propio clientId
      if (req.user?.role !== 'ADMIN') {
        data.clientId = req.user!.id;
      }

      logger.info('Creating new instance', { name: data.name, clientId: data.clientId });
      const instance = await instanceService.createInstance(data);
      ApiResponder.created(res, instance, 'Instancia creada exitosamente');
    } catch (error: any) {
      logger.error('Error creating instance', { error: error.message });
      if (error.message?.includes('Ya existe') || error.code === 'CONFLICT') {
        ApiResponder.error(res, error.message, ErrorCode.DUPLICATE, HttpStatus.CONFLICT);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/instances
  // ----------------------------------------------------------
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Helper: Express query params son string | string[] | undefined
      // Tomamos siempre el primer valor si es array
      const qs = (key: string, def?: string): string | undefined => {
        const v = req.query[key];
        if (Array.isArray(v)) return v[0] as string;
        return (v as string | undefined) ?? def;
      };

      const clientId      = qs('clientId');
      const status        = qs('status');
      const connectionType = qs('connectionType');
      const search        = qs('search');
      const page          = qs('page', '1')!;
      const limit         = qs('limit', '10')!;
      const sortBy        = qs('sortBy', 'createdAt')!;
      const sortOrder     = qs('sortOrder', 'desc')!;

      // Si no es ADMIN, forzar el filtro al propio clientId (ignora el query param)
      const effectiveClientId = req.user?.role !== 'ADMIN'
        ? req.user!.id
        : clientId;

      const { instances, total } = await instanceService.getAllInstances({
        clientId: effectiveClientId,
        status: status as any,
        connectionType: connectionType as any,
        search,
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
      });

      const parsedPage = parseInt(page);
      const parsedLimit = parseInt(limit);

      ApiResponder.success(res, {
        items: instances,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.ceil(total / parsedLimit),
          hasNextPage: parsedPage < Math.ceil(total / parsedLimit),
          hasPrevPage: parsedPage > 1,
        },
      }, 'Instancias obtenidas exitosamente');
    } catch (error: any) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/instances/:id
  // ----------------------------------------------------------
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const instance = await instanceService.getInstanceById(id);
      ApiResponder.success(res, instance, 'Instancia obtenida exitosamente');
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // PUT /api/v1/instances/:id
  // ----------------------------------------------------------
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const instance = await instanceService.updateInstance(id, req.body);
      ApiResponder.success(res, instance, 'Instancia actualizada exitosamente');
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else if (error.message?.includes('Ya existe') || error.code === 'CONFLICT') {
        ApiResponder.error(res, error.message, ErrorCode.DUPLICATE, HttpStatus.CONFLICT);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // DELETE /api/v1/instances/:id
  // ----------------------------------------------------------
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await instanceService.deleteInstance(id);
      ApiResponder.success(res, null, 'Instancia eliminada exitosamente', HttpStatus.OK);
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/instances/:id/qr
  // ----------------------------------------------------------
  async getQR(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const qrData = await instanceService.getQRCode(id);
      ApiResponder.success(res, qrData, 'QR code obtenido exitosamente');
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else if (error.code === 'ALREADY_CONNECTED') {
        ApiResponder.error(res, error.message, error.code, HttpStatus.BAD_REQUEST);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/instances/:id/status
  // ----------------------------------------------------------
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const status = await instanceService.getInstanceStatus(id);
      ApiResponder.success(res, status, 'Estado obtenido exitosamente');
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/instances/:id/metrics
  // ----------------------------------------------------------
  async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { period = '24h' } = req.query;
      const metrics = await instanceService.getMetrics(id, period as string);
      ApiResponder.success(res, metrics, 'Métricas obtenidas exitosamente');
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/instances/:id/connect
  // ----------------------------------------------------------
  async connect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const instance = await instanceService.connectInstance(id);
      ApiResponder.success(res, instance, 'Proceso de conexión iniciado');
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/instances/:id/disconnect
  // ----------------------------------------------------------
  async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const instance = await instanceService.disconnectInstance(id);
      ApiResponder.success(res, instance, 'Instancia desconectada exitosamente');
    } catch (error: any) {
      if (error.code === 'ALREADY_DISCONNECTED') {
        ApiResponder.error(res, error.message, error.code, HttpStatus.BAD_REQUEST);
      } else if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/instances/:id/restart
  // ----------------------------------------------------------
  async restart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const instance = await instanceService.restartInstance(id);
      ApiResponder.success(res, instance, 'Reinicio iniciado. La instancia se reconectará en breve.');
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/instances/:id/webhook
  // ----------------------------------------------------------
  async getWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const webhook = await instanceService.getWebhook(id);
      ApiResponder.success(res, webhook, 'Configuración de webhook obtenida');
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // PUT /api/v1/instances/:id/webhook
  // ----------------------------------------------------------
  async updateWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { url, events, enabled } = req.body;
      const result = await instanceService.updateWebhook(id, { url, events, enabled });
      ApiResponder.success(res, result, 'Webhook configurado correctamente');
    } catch (error: any) {
      if (error.message?.includes('no encontrada') || error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else {
        next(error);
      }
    }
  }
}

export const instanceController = new InstanceController();
export default instanceController;