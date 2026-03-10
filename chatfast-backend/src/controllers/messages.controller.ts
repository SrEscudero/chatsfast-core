import { Request, Response, NextFunction } from 'express';
import { messageService } from '../services/messages.service';
import type { SendPollDto, SendContactDto } from '../validators/message.validator';
import { ApiResponder } from '../utils/apiResponse';
import { HttpStatus, ErrorCode } from '../types/api.types';
import { logger } from '../config/logger';

class MessageController {

  // ----------------------------------------------------------
  // POST /api/v1/instances/:instanceId/messages/text
  // ----------------------------------------------------------
  async sendText(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId } = req.params;
      logger.info('Sending text message', { instanceId, to: req.body.number });

      const result = await messageService.sendText(instanceId, req.body);
      ApiResponder.success(res, result, 'Mensaje de texto enviado exitosamente', HttpStatus.OK);
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else if (error.code === 'SEND_REJECTED') {
        ApiResponder.error(res, error.message, error.code, HttpStatus.BAD_REQUEST);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/instances/:instanceId/messages/media
  // ----------------------------------------------------------
  async sendMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId } = req.params;
      logger.info('Sending media message', {
        instanceId,
        to: req.body.number,
        mediatype: req.body.mediatype,
      });

      const result = await messageService.sendMedia(instanceId, req.body);
      ApiResponder.success(res, result, 'Archivo multimedia enviado exitosamente');
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else if (error.code === 'SEND_REJECTED') {
        ApiResponder.error(res, error.message, error.code, HttpStatus.BAD_REQUEST);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/instances/:instanceId/messages/audio
  // ----------------------------------------------------------
  async sendAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId } = req.params;
      const result = await messageService.sendAudio(instanceId, req.body);
      ApiResponder.success(res, result, 'Nota de voz enviada exitosamente');
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else if (error.code === 'SEND_REJECTED') {
        ApiResponder.error(res, error.message, error.code, HttpStatus.BAD_REQUEST);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/instances/:instanceId/messages/location
  // ----------------------------------------------------------
  async sendLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId } = req.params;
      const result = await messageService.sendLocation(instanceId, req.body);
      ApiResponder.success(res, result, 'Ubicación enviada exitosamente');
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else if (error.code === 'SEND_REJECTED') {
        ApiResponder.error(res, error.message, error.code, HttpStatus.BAD_REQUEST);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/instances/:instanceId/messages/reaction
  // ----------------------------------------------------------
  async sendReaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId } = req.params;
      const result = await messageService.sendReaction(instanceId, req.body);
      ApiResponder.success(res, result, 'Reacción enviada exitosamente');
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else if (error.code === 'SEND_REJECTED') {
        ApiResponder.error(res, error.message, error.code, HttpStatus.BAD_REQUEST);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/instances/:instanceId/messages/poll
  // ----------------------------------------------------------
  async sendPoll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId } = req.params;
      const data = req.body as SendPollDto;

      logger.info('Sending poll', {
        instanceId,
        to:       data.number,
        question: data.name,
        options:  data.values.length,
      });

      const result = await messageService.sendPoll(instanceId, data);
      ApiResponder.success(res, result, 'Encuesta enviada exitosamente', HttpStatus.OK);
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else if (error.code === 'SEND_REJECTED') {
        ApiResponder.error(res, error.message, error.code, HttpStatus.BAD_REQUEST);
      } else {
        next(error);
      }
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/instances/:instanceId/messages/contact
  // ----------------------------------------------------------
  async sendContact(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId } = req.params;
      const data = req.body as SendContactDto;

      logger.info('Sending contact card', {
        instanceId,
        to:       data.number,
        contacts: data.contact.map((c) => c.fullName),
      });

      const result = await messageService.sendContact(instanceId, data);
      ApiResponder.success(res, result, 'Tarjeta de contacto enviada exitosamente', HttpStatus.OK);
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        ApiResponder.error(res, error.message, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
      } else if (error.code === 'SEND_REJECTED') {
        ApiResponder.error(res, error.message, error.code, HttpStatus.BAD_REQUEST);
      } else {
        next(error);
      }
    }
  }
}

export const messageController = new MessageController();
export default messageController;