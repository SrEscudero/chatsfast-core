import { Router } from 'express';
import { groupsController } from '../controllers/groups.controller';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createGroupSchema,
  updateGroupSubjectSchema,
  updateGroupDescriptionSchema,
  updateGroupPictureSchema,
  addParticipantsSchema,
  removeParticipantsSchema,
  promoteParticipantsSchema,
  demoteParticipantsSchema,
  groupJidParamSchema,
  leaveGroupSchema,
} from '../validators/groups.validator';

const router = Router({ mergeParams: true });

// router.use(authenticate);  // ← descomentar en producción
router.use(rateLimiter);

/**
 * @swagger
 * tags:
 *   - name: Grupos
 *     description: Gestión completa de grupos de WhatsApp — crear, administrar miembros y links de invitación.
 */

// ============================================================
// POST / — Crear grupo
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups:
 *   post:
 *     summary: Crear un grupo de WhatsApp
 *     description: |
 *       Crea un nuevo grupo y añade los participantes indicados.
 *       El número conectado será automáticamente el **superadmin** del grupo.
 *     tags: [Grupos]
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
 *             required: [subject, participants]
 *             properties:
 *               subject:
 *                 type: string
 *                 example: "Equipo ChatFast 🚀"
 *                 description: Nombre del grupo (máx 100 chars)
 *               description:
 *                 type: string
 *                 example: "Canal oficial de soporte Kelvis Tech"
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["5215512345678", "5215598765432"]
 *                 description: Números con código de país (sin +)
 *           examples:
 *             grupo_soporte:
 *               summary: Grupo de soporte al cliente
 *               value:
 *                 subject: "Soporte ChatFast 💬"
 *                 description: "Grupo de soporte Kelvis Tech"
 *                 participants: ["5215512345678", "5215598765432"]
 *     responses:
 *       201:
 *         description: Grupo creado exitosamente
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
 *                     id:
 *                       type: string
 *                       example: "120363xxxxxx@g.us"
 *                       description: JID del grupo — guárdalo para futuras operaciones
 *                     subject:
 *                       type: string
 */
router.post(
  '/',
  validateRequest(createGroupSchema),
  asyncHandler(groupsController.createGroup)
);

// ============================================================
// PUT /subject — Cambiar nombre
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/subject:
 *   put:
 *     summary: Cambiar el nombre del grupo
 *     tags: [Grupos]
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
 *             required: [groupJid, subject]
 *             properties:
 *               groupJid:
 *                 type: string
 *                 example: "120363xxxxxx@g.us"
 *               subject:
 *                 type: string
 *                 example: "Equipo Ventas Q2 2025 🔥"
 *     responses:
 *       200:
 *         description: Nombre actualizado exitosamente
 */
router.put(
  '/subject',
  validateRequest(updateGroupSubjectSchema),
  asyncHandler(groupsController.updateSubject)
);

// ============================================================
// PUT /description — Cambiar descripción
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/description:
 *   put:
 *     summary: Cambiar la descripción del grupo
 *     tags: [Grupos]
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
 *             required: [groupJid]
 *             properties:
 *               groupJid:
 *                 type: string
 *                 example: "120363xxxxxx@g.us"
 *               description:
 *                 type: string
 *                 example: "Bienvenidos al canal oficial de soporte. Horario: Lun-Vie 9am-6pm."
 *     responses:
 *       200:
 *         description: Descripción actualizada exitosamente
 */
router.put(
  '/description',
  validateRequest(updateGroupDescriptionSchema),
  asyncHandler(groupsController.updateDescription)
);

// ============================================================
// PUT /picture — Cambiar foto del grupo
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/picture:
 *   put:
 *     summary: Cambiar la foto del grupo
 *     tags: [Grupos]
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
 *             required: [groupJid, image]
 *             properties:
 *               groupJid:
 *                 type: string
 *                 example: "120363xxxxxx@g.us"
 *               image:
 *                 type: string
 *                 example: "https://tudominio.com/logo-grupo.jpg"
 *                 description: URL pública o base64 de la imagen
 *     responses:
 *       200:
 *         description: Foto actualizada exitosamente
 */
router.put(
  '/picture',
  validateRequest(updateGroupPictureSchema),
  asyncHandler(groupsController.updatePicture)
);

// ============================================================
// POST /participants/add
// POST /participants/remove
// POST /participants/promote
// POST /participants/demote
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/participants/add:
 *   post:
 *     summary: Añadir participantes al grupo
 *     tags: [Grupos]
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
 *             required: [groupJid, participants]
 *             properties:
 *               groupJid:
 *                 type: string
 *                 example: "120363xxxxxx@g.us"
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["5215512345678", "5215598765432"]
 *     responses:
 *       200:
 *         description: Resultado por participante
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Mapa de JID a resultado de la operación
 */
router.post('/participants/add',     validateRequest(addParticipantsSchema),     asyncHandler(groupsController.addParticipants));

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/participants/remove:
 *   post:
 *     summary: Expulsar participantes del grupo
 *     tags: [Grupos]
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
 *             required: [groupJid, participants]
 *             properties:
 *               groupJid:
 *                 type: string
 *                 example: "120363xxxxxx@g.us"
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["5215512345678"]
 *     responses:
 *       200:
 *         description: Participantes expulsados
 */
router.post('/participants/remove',  validateRequest(removeParticipantsSchema),  asyncHandler(groupsController.removeParticipants));

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/participants/promote:
 *   post:
 *     summary: Promover participantes a administrador
 *     tags: [Grupos]
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
 *             required: [groupJid, participants]
 *             properties:
 *               groupJid:
 *                 type: string
 *                 example: "120363xxxxxx@g.us"
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["5215512345678"]
 *     responses:
 *       200:
 *         description: Participantes promovidos a admin
 */
router.post('/participants/promote', validateRequest(promoteParticipantsSchema), asyncHandler(groupsController.promoteParticipants));

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/participants/demote:
 *   post:
 *     summary: Remover admin a participante normal
 *     tags: [Grupos]
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
 *             required: [groupJid, participants]
 *             properties:
 *               groupJid:
 *                 type: string
 *                 example: "120363xxxxxx@g.us"
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["5215512345678"]
 *     responses:
 *       200:
 *         description: Admin removido exitosamente
 */
router.post('/participants/demote',  validateRequest(demoteParticipantsSchema),  asyncHandler(groupsController.demoteParticipants));

// ============================================================
// GET /invite-code — Obtener link de invitación
// GET /invite-code/revoke — Revocar link
// DELETE /leave — Salir del grupo
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/invite-code:
 *   get:
 *     summary: Obtener link de invitación del grupo
 *     tags: [Grupos]
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
 *         name: groupJid
 *         required: true
 *         schema:
 *           type: string
 *         example: "120363xxxxxx@g.us"
 *     responses:
 *       200:
 *         description: Código e URL de invitación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     inviteCode:
 *                       type: string
 *                       example: "ABC123XYZ"
 *                     inviteUrl:
 *                       type: string
 *                       example: "https://chat.whatsapp.com/ABC123XYZ"
 */
router.get('/invite-code',        validateRequest(groupJidParamSchema), asyncHandler(groupsController.getInviteCode));

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/invite-code/revoke:
 *   get:
 *     summary: Revocar link de invitación (genera uno nuevo)
 *     description: Invalida el link actual y genera uno nuevo. Usar cuando el link se filtró.
 *     tags: [Grupos]
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
 *         name: groupJid
 *         required: true
 *         schema:
 *           type: string
 *         example: "120363xxxxxx@g.us"
 *     responses:
 *       200:
 *         description: Nuevo link generado, anterior invalidado
 */
router.get('/invite-code/revoke', validateRequest(groupJidParamSchema), asyncHandler(groupsController.revokeInviteCode));

/**
 * @swagger
 * /api/v1/instances/{instanceId}/groups/leave:
 *   delete:
 *     summary: Salir de un grupo
 *     tags: [Grupos]
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
 *             required: [groupJid]
 *             properties:
 *               groupJid:
 *                 type: string
 *                 example: "120363xxxxxx@g.us"
 *     responses:
 *       200:
 *         description: Saliste del grupo exitosamente
 */
router.delete('/leave', validateRequest(leaveGroupSchema), asyncHandler(groupsController.leaveGroup));

export default router;