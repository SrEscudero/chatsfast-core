import { Router } from 'express';
import { profileController } from '../controllers/profile.controller';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import {
  updateProfilePictureSchema,
  updateProfileNameSchema,
  updateProfileStatusSchema,
  revokeMessageSchema,
} from '../validators/profile.validator';

const router = Router({ mergeParams: true });

// router.use(authenticate);  // ← descomentar en producción
router.use(rateLimiter);

/**
 * @swagger
 * tags:
 *   - name: Perfil
 *     description: Gestión del perfil del número conectado y eliminación de mensajes.
 */

/**
 * @swagger
 * /api/v1/instances/{instanceId}/profile/picture:
 *   put:
 *     summary: Actualizar foto de perfil del bot
 *     description: |
 *       Cambia la foto de perfil del número de WhatsApp conectado.
 *       Acepta URL pública o base64. Recomendado JPG cuadrado, mínimo 200x200px.
 *     tags: [Perfil]
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
 *             required: [picture]
 *             properties:
 *               picture:
 *                 type: string
 *                 example: "https://tudominio.com/logo-chatfast.jpg"
 *                 description: URL pública o base64 de la imagen (JPG/PNG)
 *     responses:
 *       200:
 *         description: Foto de perfil actualizada exitosamente
 */
router.put(
  '/picture',
  validateRequest(updateProfilePictureSchema),
  asyncHandler(profileController.updateProfilePicture)
);

/**
 * @swagger
 * /api/v1/instances/{instanceId}/profile/name:
 *   put:
 *     summary: Actualizar nombre del perfil (PushName)
 *     description: |
 *       Cambia el nombre visible del número de WhatsApp.
 *       Es el nombre que ven los contactos cuando reciben un mensaje.
 *       Máximo 25 caracteres (límite de WhatsApp).
 *     tags: [Perfil]
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
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "ChatFast Soporte"
 *                 description: Nombre visible (máx 25 chars)
 *           examples:
 *             nombre_empresa:
 *               summary: Nombre de empresa
 *               value:
 *                 name: "ChatFast Soporte"
 *             nombre_bot:
 *               summary: Nombre de bot
 *               value:
 *                 name: "Asistente Kelvis"
 *     responses:
 *       200:
 *         description: Nombre actualizado exitosamente
 */
router.put(
  '/name',
  validateRequest(updateProfileNameSchema),
  asyncHandler(profileController.updateProfileName)
);

/**
 * @swagger
 * /api/v1/instances/{instanceId}/profile/status:
 *   put:
 *     summary: Actualizar estado/bio del perfil
 *     description: |
 *       Cambia el texto de estado/bio del número (el que aparece debajo del nombre).
 *       Máximo 139 caracteres. Enviar `status: ""` para dejarlo vacío.
 *     tags: [Perfil]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 example: "Soporte disponible Lun-Vie 9am-6pm 🕘"
 *                 description: Texto de estado (máx 139 chars)
 *           examples:
 *             horario_atencion:
 *               summary: Horario de atención
 *               value:
 *                 status: "Atención Lun-Vie 9am-6pm | chatfast.io 🚀"
 *             disponible:
 *               summary: Disponible siempre
 *               value:
 *                 status: "¡Hola! Escríbeme, te respondo al instante 👋"
 *     responses:
 *       200:
 *         description: Estado actualizado exitosamente
 */
router.put(
  '/status',
  validateRequest(updateProfileStatusSchema),
  asyncHandler(profileController.updateProfileStatus)
);

/**
 * @swagger
 * /api/v1/instances/{instanceId}/profile/revoke-message:
 *   delete:
 *     summary: Eliminar un mensaje para todos (Revoke)
 *     description: |
 *       Borra un mensaje enviado de la pantalla del receptor.
 *       WhatsApp mostrará "Este mensaje fue eliminado" en su lugar.
 *
 *       **Obtener el key.id:**
 *       - De la respuesta de `POST /messages/text` → `data.key.id`
 *       - Del webhook `MESSAGES_UPSERT` → `data.key.id`
 *
 *       **Limitaciones:**
 *       - Solo puedes borrar mensajes enviados por ti (`fromMe: true`)
 *       - Mensajes muy antiguos pueden no borrarse en el dispositivo receptor
 *     tags: [Perfil]
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
 *             required: [key]
 *             properties:
 *               key:
 *                 type: object
 *                 required: [remoteJid, fromMe, id]
 *                 properties:
 *                   remoteJid:
 *                     type: string
 *                     example: "5215512345678@s.whatsapp.net"
 *                   fromMe:
 *                     type: boolean
 *                     example: true
 *                     description: Siempre true — solo puedes borrar los que tú enviaste
 *                   id:
 *                     type: string
 *                     example: "BAE594145F4C59B4"
 *                     description: ID del mensaje enviado (de la respuesta del sendText)
 *           examples:
 *             eliminar_mensaje:
 *               summary: Eliminar mensaje enviado
 *               value:
 *                 key:
 *                   remoteJid: "5215512345678@s.whatsapp.net"
 *                   fromMe: true
 *                   id: "BAE594145F4C59B4"
 *     responses:
 *       200:
 *         description: Mensaje eliminado para todos exitosamente
 *       404:
 *         description: Instancia no encontrada
 */
router.delete(
  '/revoke-message',
  validateRequest(revokeMessageSchema),
  asyncHandler(profileController.revokeMessage)
);

export default router;