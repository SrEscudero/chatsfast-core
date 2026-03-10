import { Router } from 'express';
import { infraController } from '../controllers/infra.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();

// All infra routes require authentication + ADMIN role
router.use(authenticate, authorize('ADMIN'));

/**
 * @swagger
 * tags:
 *   name: Infra
 *   description: Infraestructura del servidor — métricas del sistema y gestión de contenedores Docker
 */

// ============================================================
// GET /api/v1/infra/metrics
// ============================================================
/**
 * @swagger
 * /infra/metrics:
 *   get:
 *     summary: Métricas actuales del sistema (CPU, RAM, Disco, OS)
 *     tags: [Infra]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Métricas del sistema
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
 *                     cpu:
 *                       type: object
 *                       properties:
 *                         brand:
 *                           type: string
 *                         cores:
 *                           type: integer
 *                         usagePercent:
 *                           type: number
 *                     memory:
 *                       type: object
 *                       properties:
 *                         totalGb:
 *                           type: number
 *                         usedGb:
 *                           type: number
 *                         freeGb:
 *                           type: number
 *                         usagePercent:
 *                           type: number
 *                     disk:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           mount:
 *                             type: string
 *                           totalGb:
 *                             type: number
 *                           freeGb:
 *                             type: number
 *                           usagePercent:
 *                             type: number
 *                     os:
 *                       type: object
 *                       properties:
 *                         platform:
 *                           type: string
 *                         distro:
 *                           type: string
 *                         hostname:
 *                           type: string
 *                         uptimeFormatted:
 *                           type: string
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Acceso denegado
 */
router.get('/metrics', infraController.getMetrics.bind(infraController));

// ============================================================
// GET /api/v1/infra/metrics/live  — SSE
// ============================================================
/**
 * @swagger
 * /infra/metrics/live:
 *   get:
 *     summary: Stream SSE de métricas del sistema cada 5 segundos
 *     tags: [Infra]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Evento emitido: `metrics` — snapshot completo de CPU, RAM y disco.
 *       ```js
 *       const es = new EventSource('/api/v1/infra/metrics/live');
 *       es.addEventListener('metrics', (e) => console.log(JSON.parse(e.data)));
 *       ```
 *     responses:
 *       200:
 *         description: Stream SSE iniciado
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get('/metrics/live', infraController.liveMetrics.bind(infraController));

// ============================================================
// GET /api/v1/infra/containers
// ============================================================
/**
 * @swagger
 * /infra/containers:
 *   get:
 *     summary: Lista todos los contenedores Docker
 *     tags: [Infra]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: all
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Si false, solo muestra contenedores en ejecución
 *     responses:
 *       200:
 *         description: Lista de contenedores
 *       503:
 *         description: Docker no disponible
 */
router.get('/containers', infraController.getContainers.bind(infraController));

// ============================================================
// GET /api/v1/infra/containers/:id
// ============================================================
/**
 * @swagger
 * /infra/containers/{id}:
 *   get:
 *     summary: Inspecciona un contenedor específico
 *     tags: [Infra]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID o nombre del contenedor (pueden ser los primeros 12 chars)
 *     responses:
 *       200:
 *         description: Info del contenedor
 *       404:
 *         description: Contenedor no encontrado
 */
router.get('/containers/:id', infraController.getContainer.bind(infraController));

// ============================================================
// POST /api/v1/infra/containers/:id/restart
// ============================================================
/**
 * @swagger
 * /infra/containers/{id}/restart:
 *   post:
 *     summary: Reinicia un contenedor Docker
 *     tags: [Infra]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contenedor reiniciado
 *       404:
 *         description: Contenedor no encontrado
 */
router.post('/containers/:id/restart', infraController.restartContainer.bind(infraController));

// ============================================================
// POST /api/v1/infra/containers/:id/stop
// ============================================================
/**
 * @swagger
 * /infra/containers/{id}/stop:
 *   post:
 *     summary: Detiene un contenedor Docker
 *     tags: [Infra]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contenedor detenido
 *       404:
 *         description: Contenedor no encontrado
 */
router.post('/containers/:id/stop', infraController.stopContainer.bind(infraController));

// ============================================================
// POST /api/v1/infra/containers/:id/start
// ============================================================
/**
 * @swagger
 * /infra/containers/{id}/start:
 *   post:
 *     summary: Inicia un contenedor Docker detenido
 *     tags: [Infra]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contenedor iniciado
 *       404:
 *         description: Contenedor no encontrado
 */
router.post('/containers/:id/start', infraController.startContainer.bind(infraController));

// ============================================================
// GET /api/v1/infra/containers/:id/logs  — SSE
// ============================================================
/**
 * @swagger
 * /infra/containers/{id}/logs:
 *   get:
 *     summary: Stream SSE de logs de un contenedor Docker en tiempo real
 *     tags: [Infra]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     description: |
 *       Eventos emitidos:
 *       - `log` — línea de log con campos: message, timestamp
 *       - `end` — stream finalizado (contenedor detuvo el output)
 *       - `error` — error en el stream
 *     responses:
 *       200:
 *         description: Stream SSE iniciado
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       404:
 *         description: Contenedor no encontrado
 */
router.get('/containers/:id/logs', infraController.streamContainerLogs.bind(infraController));

export default router;
