import { Request, Response, NextFunction } from 'express';
import { campaignService } from '../services/campaign.service';
import { ApiResponder } from '../utils/apiResponse';

class CampaignController {

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.user!.role === 'ADMIN' ? (req.query.clientId as string | undefined) : req.user!.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await campaignService.list(clientId ?? req.user!.id, {
        page, limit,
        status: req.query.status as string | undefined,
        instanceId: req.query.instanceId as string | undefined,
      });
      const totalPages = Math.ceil(result.total / limit);
      ApiResponder.success(res, {
        items: result.items,
        pagination: { page, limit, total: result.total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (e) { next(e); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.user!.role === 'ADMIN' ? undefined : req.user!.id;
      const campaign = await campaignService.getById(req.params.id, clientId);
      ApiResponder.success(res, campaign);
    } catch (e) { next(e); }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.user!.role === 'ADMIN' ? (req.body.clientId ?? req.user!.id) : req.user!.id;
      const campaign = await campaignService.create({ ...req.body, clientId });
      ApiResponder.created(res, campaign, 'Campaña creada exitosamente');
    } catch (e) { next(e); }
  }

  async launch(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.user!.role === 'ADMIN' ? undefined : req.user!.id;
      const result = await campaignService.launch(req.params.id, clientId);
      ApiResponder.success(res, result, 'Campaña iniciada');
    } catch (e) { next(e); }
  }

  async pause(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.user!.role === 'ADMIN' ? undefined : req.user!.id;
      const campaign = await campaignService.updateStatus(req.params.id, 'PAUSED', clientId);
      ApiResponder.success(res, campaign, 'Campaña pausada');
    } catch (e) { next(e); }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.user!.role === 'ADMIN' ? undefined : req.user!.id;
      const campaign = await campaignService.updateStatus(req.params.id, 'CANCELLED', clientId);
      ApiResponder.success(res, campaign, 'Campaña cancelada');
    } catch (e) { next(e); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.user!.role === 'ADMIN' ? undefined : req.user!.id;
      await campaignService.delete(req.params.id, clientId);
      ApiResponder.success(res, null, 'Campaña eliminada');
    } catch (e) { next(e); }
  }
}

export const campaignController = new CampaignController();
