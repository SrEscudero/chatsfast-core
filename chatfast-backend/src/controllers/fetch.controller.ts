import { Request, Response, NextFunction } from 'express';
import { fetchService } from '../services/fetch.service';

class FetchController {

  async fetchContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await fetchService.fetchContacts(req.params.instanceId);
      res.status(200).json({
        success: true,
        message: `${result.length} contactos sincronizados`,
        data: result,
      });
    } catch (error) { next(error); }
  }

  async fetchChats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await fetchService.fetchChats(req.params.instanceId);
      res.status(200).json({
        success: true,
        message: `${result.length} chats sincronizados`,
        data: result,
      });
    } catch (error) { next(error); }
  }

  async fetchMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { remoteJid, count } = req.query as { remoteJid: string; count?: string };
      const result = await fetchService.fetchMessages(
        req.params.instanceId,
        remoteJid,
        count ? parseInt(count, 10) : 20
      );
      res.status(200).json({
        success: true,
        message: `${result.length} mensajes obtenidos`,
        data: result,
      });
    } catch (error) { next(error); }
  }
}

export const fetchController = new FetchController();
export default fetchController;