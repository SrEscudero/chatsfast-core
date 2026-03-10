import { Request, Response, NextFunction } from 'express';
import { groupsService } from '../services/groups.service';

class GroupsController {

  async createGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await groupsService.createGroup(req.params.instanceId, req.body);
      res.status(201).json({ success: true, message: 'Grupo creado exitosamente', data: result });
    } catch (error) { next(error); }
  }

  async updateSubject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await groupsService.updateSubject(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Nombre del grupo actualizado', data: result });
    } catch (error) { next(error); }
  }

  async updateDescription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await groupsService.updateDescription(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Descripción del grupo actualizada', data: result });
    } catch (error) { next(error); }
  }

  async updatePicture(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await groupsService.updatePicture(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Foto del grupo actualizada', data: result });
    } catch (error) { next(error); }
  }

  async addParticipants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await groupsService.addParticipants(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Participantes añadidos', data: result });
    } catch (error) { next(error); }
  }

  async removeParticipants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await groupsService.removeParticipants(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Participantes eliminados', data: result });
    } catch (error) { next(error); }
  }

  async promoteParticipants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await groupsService.promoteParticipants(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Participantes promovidos a admin', data: result });
    } catch (error) { next(error); }
  }

  async demoteParticipants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await groupsService.demoteParticipants(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Participantes removidos de admin', data: result });
    } catch (error) { next(error); }
  }

  async getInviteCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupJid } = req.query as { groupJid: string };
      const result = await groupsService.getInviteCode(req.params.instanceId, groupJid);
      res.status(200).json({ success: true, message: 'Código de invitación obtenido', data: result });
    } catch (error) { next(error); }
  }

  async revokeInviteCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupJid } = req.query as { groupJid: string };
      const result = await groupsService.revokeInviteCode(req.params.instanceId, groupJid);
      res.status(200).json({ success: true, message: 'Link de invitación revocado. Nuevo link generado.', data: result });
    } catch (error) { next(error); }
  }

  async leaveGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await groupsService.leaveGroup(req.params.instanceId, req.body.groupJid);
      res.status(200).json({ success: true, message: 'Saliste del grupo exitosamente', data: result });
    } catch (error) { next(error); }
  }
}

export const groupsController = new GroupsController();
export default groupsController;