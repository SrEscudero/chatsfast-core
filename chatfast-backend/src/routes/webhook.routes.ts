import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

// ============================================================
// NOTA IMPORTANTE SOBRE SEGURIDAD:
// Este endpoint NO lleva middleware authenticate porque
// Evolution API no envía JWT — firma los eventos con HMAC.
// La verificación de firma se hace DENTRO del controller.
// ============================================================

/**
 * @swagger
 * tags:
 *   - name: Webhooks
 *     description: Recepción de eventos en tiempo real desde Evolution API
 */

/**
 * @swagger
 * /api/v1/webhooks/evolution:
 *   post:
 *     summary: Endpoint receptor para eventos de Evolution API
 *     description: |
 *       Evolution API enviará un POST a este endpoint cada vez que ocurra
 *       un evento en cualquier instancia (mensajes, cambios de estado, QR, etc.).
 *
 *       **Este endpoint NO requiere autenticación JWT.**
 *       Evolution API lo llama directamente desde sus servidores.
 *
 *       **Eventos que llegan aquí:**
 *       - MESSAGES_UPSERT: mensaje nuevo recibido o enviado
 *       - CONNECTION_UPDATE: instancia conectada, desconectada o con error
 *       - QRCODE_UPDATED: nuevo QR generado para una instancia
 *       - CALL_UPSERT: llamada entrante detectada
 *
 *       **Estructura del body (ejemplo CONNECTION_UPDATE):**
 *       ```json
 *       {
 *         "event": "connection.update",
 *         "instance": "nombre_instancia",
 *         "data": {
 *           "instance": "nombre_instancia",
 *           "state": "open"
 *         }
 *       }
 *       ```
 *
 *       **Configuración en Evolution API:**
 *       El webhook se configura automáticamente al crear una instancia.
 *       URL configurada: POST /api/v1/webhooks/evolution
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 example: connection.update
 *                 description: Tipo de evento recibido desde Evolution API
 *               instance:
 *                 type: string
 *                 example: soporte_tech_01
 *                 description: Nombre de la instancia que generó el evento
 *               data:
 *                 type: object
 *                 description: Payload del evento (varía según el tipo)
 *           examples:
 *             connection_update:
 *               summary: Instancia conectada
 *               value:
 *                 event: connection.update
 *                 instance: soporte_tech_01
 *                 data:
 *                   instance: soporte_tech_01
 *                   state: open
 *             qrcode_updated:
 *               summary: Nuevo QR generado
 *               value:
 *                 event: qrcode.updated
 *                 instance: soporte_tech_01
 *                 data:
 *                   qrcode:
 *                     base64: iVBORw0KGgoAAAANSUhEUgAA...
 *             message_received:
 *               summary: Mensaje recibido
 *               value:
 *                 event: messages.upsert
 *                 instance: soporte_tech_01
 *                 data:
 *                   key:
 *                     remoteJid: 5215512345678@s.whatsapp.net
 *                     fromMe: false
 *                     id: ABCD1234
 *                   message:
 *                     conversation: Hola, necesito ayuda
 *     responses:
 *       200:
 *         description: Evento recibido y encolado para procesamiento
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Webhook recibido
 *       400:
 *         description: Body inválido o firma HMAC incorrecta
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error:
 *                 code: INVALID_SIGNATURE
 *                 message: Firma del webhook inválida
 */
router.post('/evolution', webhookController.handleEvolutionWebhook);

export default router;