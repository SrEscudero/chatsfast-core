import { Router } from 'express';
import { fetchController } from '../controllers/fetch.controller';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import {
  fetchContactsSchema,
  fetchChatsSchema,
  fetchMessagesSchema,
} from '../validators/fetch.validator';

const router = Router({ mergeParams: true });

// router.use(authenticate);  // ← descomentar en producción
router.use(rateLimiter);

/**
 * @swagger
 * tags:
 *   - name: Sincronización
 *     description: Descarga contactos, chats e historial de mensajes del teléfono conectado.
 */

/**
 * @swagger
 * /api/v1/instances/{instanceId}/sync/contacts:
 *   get:
 *     summary: Sincronizar contactos de la agenda
 *     description: |
 *       Descarga toda la agenda del teléfono conectado.
 *
 *       **Caso de uso principal:**
 *       Mostrar en el CRM todos los contactos disponibles antes de que
 *       el usuario inicie conversaciones desde ChatFast.
 *
 *       **Performance:** En agendas grandes (>500 contactos) esta operación
 *       puede tardar 3-8 segundos. Considera llamarla en background al conectar.
 *     tags: [Sincronización]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Contactos sincronizados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "342 contactos sincronizados"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "5215512345678@s.whatsapp.net"
 *                       name:
 *                         type: string
 *                         example: "Kelvis Escudero"
 *                       pushname:
 *                         type: string
 *                         example: "Kelvis"
 *       409:
 *         description: Instancia no conectada
 */
router.get(
  '/contacts',
  validateRequest(fetchContactsSchema),
  asyncHandler(fetchController.fetchContacts)
);

/**
 * @swagger
 * /api/v1/instances/{instanceId}/sync/chats:
 *   get:
 *     summary: Sincronizar lista de conversaciones
 *     description: |
 *       Trae la lista de conversaciones abiertas, como la pantalla principal de WhatsApp.
 *       Incluye nombre, último mensaje y cantidad de mensajes no leídos.
 *
 *       **Caso de uso:** Renderizar el panel de bandeja de entrada en tu CRM.
 *     tags: [Sincronización]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Chats sincronizados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "87 chats sincronizados"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "5215512345678@s.whatsapp.net"
 *                       name:
 *                         type: string
 *                       unreadCount:
 *                         type: number
 *                         example: 3
 */
router.get(
  '/chats',
  validateRequest(fetchChatsSchema),
  asyncHandler(fetchController.fetchChats)
);

/**
 * @swagger
 * /api/v1/instances/{instanceId}/sync/messages:
 *   get:
 *     summary: Obtener historial de mensajes de un chat
 *     description: |
 *       Trae los mensajes pasados de una conversación específica.
 *
 *       **Caso de uso principal:**
 *       Mostrar el historial de conversación en el CRM cuando el asesor
 *       abre un chat. Permite ver mensajes anteriores a la conexión de ChatFast.
 *
 *       **Parámetros:**
 *       - `remoteJid`: El JID del chat (obtenerlo de `/sync/chats`)
 *       - `count`: Cuántos mensajes traer (default 20, máx 100)
 *     tags: [Sincronización]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: remoteJid
 *         required: true
 *         schema:
 *           type: string
 *         example: "5215512345678@s.whatsapp.net"
 *         description: JID del chat (personal o grupo)
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Cantidad de mensajes a traer
 *     responses:
 *       200:
 *         description: Mensajes obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "20 mensajes obtenidos"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           fromMe:
 *                             type: boolean
 *                           remoteJid:
 *                             type: string
 *                       messageTimestamp:
 *                         type: number
 *                       pushName:
 *                         type: string
 */
router.get(
  '/messages',
  validateRequest(fetchMessagesSchema),
  asyncHandler(fetchController.fetchMessages)
);

export default router;