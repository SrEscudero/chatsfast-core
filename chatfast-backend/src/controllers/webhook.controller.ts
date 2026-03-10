import { Request, Response } from 'express';
import { webhookService } from '../services/webhook.service';
import { logger } from '../config/logger';

class WebhookController {
  async handleEvolutionWebhook(req: Request, res: Response): Promise<void> {
    // 1. Responder INMEDIATAMENTE a Evolution API para evitar timeouts
    res.status(200).json({ success: true, message: 'Webhook recibido' });

    // 2. Procesar el payload en segundo plano (sin await)
    try {
      const payload = req.body;

      // ─── LOG DE MENSAJES ENTRANTES ────────────────────────────────
      // Muestra el ID, remoteJid y texto de cada mensaje recibido.
      // Necesitas estos datos para probar mark-read y reactions.
      if (payload?.event === 'messages.upsert') {
        const messages: any[] = payload?.data?.messages ?? [];
        messages.forEach((msg: any) => {
          // Solo logear mensajes que NO son del propio bot (fromMe: false)
          if (!msg.key?.fromMe) {
            logger.info('📨 MENSAJE RECIBIDO', {
              id:        msg.key?.id,
              fromMe:    msg.key?.fromMe,
              remoteJid: msg.key?.remoteJid,
              texto:     msg.message?.conversation
                      ?? msg.message?.extendedTextMessage?.text
                      ?? '[media/otro tipo]',
              de:        msg.pushName ?? 'desconocido',
            });
          }
        });
      }
      // ─────────────────────────────────────────────────────────────

      webhookService.processEvent(payload).catch((err) => {
        logger.error('Error asíncrono en WebhookService', { error: err.message });
      });
    } catch (error: any) {
      logger.error('Error capturando payload del webhook', { error: error.message });
    }
  }
}

export const webhookController = new WebhookController();
export default webhookController;