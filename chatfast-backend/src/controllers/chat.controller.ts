import { Request, Response, NextFunction } from 'express';
import { chatService } from '../services/chat.service';
import { SendPresenceDto, MarkReadDto } from '../validators/message.validator';

// ============================================================
// CHAT CONTROLLER
//
// Responsabilidad única: traducir HTTP ↔ Service.
//   - Extrae params/body del request
//   - Llama al service
//   - Devuelve la respuesta HTTP con el formato estándar
//   - NO contiene lógica de negocio (eso es del service)
//   - NO maneja errores directamente → los propaga al errorHandler
//     global via asyncHandler (next(error))
// ============================================================

class ChatController {
  // POST /api/v1/instances/:instanceId/chat/presence
  async sendPresence(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId } = req.params;
      const data = req.body as SendPresenceDto;

      const result = await chatService.sendPresence(instanceId, data);

      res.status(200).json({
        success: true,
        message: `Estado "${data.presence}" simulado exitosamente`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/instances/:instanceId/chat/mark-read
  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId } = req.params;
      const data = req.body as MarkReadDto;

      const result = await chatService.markAsRead(instanceId, data);

      res.status(200).json({
        success: true,
        message: `${data.readMessages.length} mensaje(s) marcado(s) como leído(s)`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/instances/:instanceId/chat/profile-picture/:number
  async getProfilePicture(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { instanceId, number } = req.params;

      // Validar que el número no esté vacío antes de llegar al service
      if (!number || number.trim().length < 10) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Número de teléfono inválido. Incluye código de país. Ej: 5215512345678',
          },
        });
        return;
      }

      const result = await chatService.getProfilePicture(instanceId, number);

      res.status(200).json({
        success: true,
        message: result.profilePictureUrl
          ? 'Foto de perfil obtenida exitosamente'
          : 'El contacto no tiene foto de perfil configurada',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

// Instancia única exportada para que el router la use
export const chatController = new ChatController();
export default chatController;