import { Router } from 'express';
import { chatController } from '../controllers/chat.controller';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPresenceSchema, markReadSchema } from '../validators/message.validator';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(rateLimiter);

/**
 * @swagger
 * tags:
 *   - name: Chat CRM
 *     description: Herramientas avanzadas de interacción y CRM de WhatsApp.
 */

/**
 * @swagger
 * /api/v1/instances/{instanceId}/chat/presence:
 *   post:
 *     summary: Simular estado escribiendo o grabando
 *     description: |
 *       Fuerza a WhatsApp a mostrar "Escribiendo..." o "Grabando audio..."
 *       al destinatario durante los milisegundos especificados.
 *       Ideal para bots que quieren simular comportamiento humano.
 *     tags: [Chat CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID de la instancia de WhatsApp
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - number
 *               - presence
 *             properties:
 *               number:
 *                 type: string
 *                 example: "5215512345678"
 *                 description: Número destino con código de país
 *               presence:
 *                 type: string
 *                 enum: [composing, recording, paused]
 *                 example: composing
 *                 description: composing = escribiendo, recording = grabando audio
 *               delay:
 *                 type: integer
 *                 example: 3000
 *                 description: Milisegundos que dura el estado visible. Default 1000ms.
 *     responses:
 *       200:
 *         description: Presencia simulada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Estado "composing" simulado exitosamente
 *       409:
 *         description: La instancia no está conectada
 *       404:
 *         description: Instancia no encontrada
 */
router.post(
  '/presence',
  validateRequest(sendPresenceSchema),
  asyncHandler(chatController.sendPresence)
);

/**
 * @swagger
 * /api/v1/instances/{instanceId}/chat/mark-read:
 *   post:
 *     summary: Marcar mensajes como leídos (doble check azul)
 *     description: |
 *       Envía la confirmación de lectura a uno o más mensajes específicos.
 *       Requiere los IDs exactos de los mensajes obtenidos del webhook.
 *     tags: [Chat CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - readMessages
 *             properties:
 *               readMessages:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - remoteJid
 *                     - fromMe
 *                     - id
 *                   properties:
 *                     remoteJid:
 *                       type: string
 *                       example: "5215512345678@s.whatsapp.net"
 *                     fromMe:
 *                       type: boolean
 *                       example: false
 *                     id:
 *                       type: string
 *                       example: "BAE594145F4C59B4"
 *     responses:
 *       200:
 *         description: Mensajes marcados como leídos exitosamente
 *       409:
 *         description: La instancia no está conectada
 */
router.post(
  '/mark-read',
  validateRequest(markReadSchema),
  asyncHandler(chatController.markAsRead)
);

/**
 * @swagger
 * /api/v1/instances/{instanceId}/chat/profile-picture/{number}:
 *   get:
 *     summary: Obtener la foto de perfil de un contacto
 *     description: |
 *       Devuelve la URL pública de la foto de perfil del contacto.
 *       Respuesta cacheada por 15 minutos para reducir llamadas a Evolution API.
 *     tags: [Chat CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: number
 *         required: true
 *         schema:
 *           type: string
 *         example: "5215512345678"
 *         description: Número del contacto con código de país (sin @s.whatsapp.net)
 *     responses:
 *       200:
 *         description: URL de foto obtenida (puede ser null si no tiene foto)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     wuid:
 *                       type: string
 *                       example: "5215512345678@s.whatsapp.net"
 *                     profilePictureUrl:
 *                       type: string
 *                       nullable: true
 *                       example: "https://pps.whatsapp.net/v/..."
 *       409:
 *         description: La instancia no está conectada
 */
router.get(
  '/profile-picture/:number',
  asyncHandler(chatController.getProfilePicture)
);

export default router;