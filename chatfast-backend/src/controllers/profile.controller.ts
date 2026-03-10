import { Request, Response, NextFunction } from 'express';
import { profileService } from '../services/profile.service';

class ProfileController {

  async updateProfilePicture(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await profileService.updateProfilePicture(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Foto de perfil actualizada exitosamente', data: result });
    } catch (error) { next(error); }
  }

  async updateProfileName(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await profileService.updateProfileName(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Nombre actualizado exitosamente', data: result });
    } catch (error) { next(error); }
  }

  async updateProfileStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await profileService.updateProfileStatus(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Estado actualizado exitosamente', data: result });
    } catch (error) { next(error); }
  }

  async revokeMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await profileService.revokeMessage(req.params.instanceId, req.body);
      res.status(200).json({ success: true, message: 'Mensaje eliminado para todos', data: result });
    } catch (error) { next(error); }
  }
}

export const profileController = new ProfileController();
export default profileController;