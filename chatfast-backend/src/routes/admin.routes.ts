import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate, authorize('ADMIN'));

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Dashboard administrativo — solo ADMIN
 */

// ============================================================
// GET /api/v1/admin/overview
// ============================================================
/**
 * @swagger
 * /admin/overview:
 *   get:
 *     summary: Estadísticas globales de la plataforma
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas globales
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
 *                     clients:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                         suspended:
 *                           type: integer
 *                         byPlan:
 *                           type: object
 *                           additionalProperties:
 *                             type: integer
 *                     instances:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         connected:
 *                           type: integer
 *                         connecting:
 *                           type: integer
 *                         disconnected:
 *                           type: integer
 *                         error:
 *                           type: integer
 *                         pending:
 *                           type: integer
 *                     sessions:
 *                       type: object
 *                       properties:
 *                         active:
 *                           type: integer
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Acceso denegado (no es ADMIN)
 */
router.get('/overview', adminController.getOverview.bind(adminController));

// ============================================================
// GET /api/v1/admin/health
// ============================================================
/**
 * @swagger
 * /admin/health:
 *   get:
 *     summary: Estado de salud de los servicios (DB + Evolution API)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Todos los servicios operativos
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
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [ok, error]
 *                         latencyMs:
 *                           type: number
 *                         error:
 *                           type: string
 *                     evolutionApi:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [ok, error]
 *                         latencyMs:
 *                           type: number
 *                         error:
 *                           type: string
 *                     overall:
 *                       type: string
 *                       enum: [healthy, degraded, unhealthy]
 *       503:
 *         description: Sistema no disponible (DB caída)
 */
router.get('/health', adminController.getHealth.bind(adminController));

// ============================================================
// GET /api/v1/admin/instances
// ============================================================
/**
 * @swagger
 * /admin/instances:
 *   get:
 *     summary: Listado paginado de todas las instancias (admin view)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONNECTING, CONNECTED, DISCONNECTED, ERROR]
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Busca por nombre o número de teléfono
 *     responses:
 *       200:
 *         description: Lista paginada de instancias
 */
router.get('/instances', adminController.getInstances.bind(adminController));

// ============================================================
// GET /api/v1/admin/instances/live  — SSE
// ============================================================
/**
 * @swagger
 * /admin/instances/live:
 *   get:
 *     summary: Stream SSE del estado de todas las instancias (cada 5s)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Retorna un stream Server-Sent Events (SSE).
 *       Eventos emitidos:
 *       - `snapshot` — array completo de instancias con su estado actual
 *
 *       Conectar con EventSource:
 *       ```js
 *       const es = new EventSource('/api/v1/admin/instances/live', {
 *         headers: { Authorization: 'Bearer <token>' }
 *       });
 *       es.addEventListener('snapshot', (e) => console.log(JSON.parse(e.data)));
 *       ```
 *     responses:
 *       200:
 *         description: Stream SSE iniciado
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get('/instances/live', adminController.liveInstances.bind(adminController));

// ============================================================
// GET /api/v1/admin/logs  — SSE
// ============================================================
/**
 * @swagger
 * /admin/logs:
 *   get:
 *     summary: Stream SSE de logs del servidor en tiempo real
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Retorna un stream Server-Sent Events (SSE).
 *       Eventos emitidos:
 *       - `connected` — confirmación de conexión
 *       - `log` — entrada de log con campos: level, message, timestamp
 *
 *       Conectar con EventSource:
 *       ```js
 *       const es = new EventSource('/api/v1/admin/logs', {
 *         headers: { Authorization: 'Bearer <token>' }
 *       });
 *       es.addEventListener('log', (e) => console.log(JSON.parse(e.data)));
 *       ```
 *     responses:
 *       200:
 *         description: Stream SSE iniciado
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get('/logs', adminController.liveLogs.bind(adminController));

export default router;
