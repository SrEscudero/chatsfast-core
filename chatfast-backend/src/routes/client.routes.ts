import { Router } from 'express';
import { clientController } from '../controllers/client.controller';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { createClientSchema, updateClientSchema, clientParamSchema } from '../validators/client.validator';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   - name: Clientes
 *     description: Gestión de cuentas de clientes. ADMIN tiene acceso total; CLIENT solo puede ver y editar su propio perfil.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Client:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "4990a981-80c3-4f51-825d-1f593f11eb7c"
 *         name:
 *           type: string
 *           example: "Kelvis Escudero"
 *         email:
 *           type: string
 *           example: "kelvis@chatfast.io"
 *         phone:
 *           type: string
 *           example: "521234567890"
 *         role:
 *           type: string
 *           enum: [ADMIN, OPERATOR, CLIENT]
 *           example: CLIENT
 *         plan:
 *           type: string
 *           enum: [FREE, BASIC, PREMIUM, ENTERPRISE]
 *           example: FREE
 *         planExpiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         active:
 *           type: boolean
 *           example: true
 *         suspended:
 *           type: boolean
 *           example: false
 *         suspendedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         _count:
 *           type: object
 *           properties:
 *             instances:
 *               type: integer
 *               example: 3
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// ─── GET /clients ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/clients:
 *   get:
 *     summary: Listar clientes
 *     description: |
 *       - **ADMIN**: devuelve todos los clientes paginados.
 *       - **CLIENT/OPERATOR**: devuelve únicamente su propio perfil.
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Resultados por página
 *     responses:
 *       200:
 *         description: Lista de clientes
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 items:
 *                   - id: "4990a981-80c3-4f51-825d-1f593f11eb7c"
 *                     name: "Kelvis Escudero"
 *                     email: "kelvis@chatfast.io"
 *                     role: "ADMIN"
 *                     plan: "PREMIUM"
 *                     active: true
 *                     suspended: false
 *                     _count:
 *                       instances: 3
 *                 pagination:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *       401:
 *         description: No autenticado
 */
router.get('/', clientController.getAll);

// ─── POST /clients ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/clients:
 *   post:
 *     summary: Crear cliente (ADMIN)
 *     description: |
 *       Crea un nuevo cliente manualmente. Solo disponible para ADMIN.
 *       Útil para onboarding manual o creación de cuentas internas.
 *       La contraseña se hashea automáticamente.
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Empresa XYZ"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "contacto@empresaxyz.com"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "Empresa2026!!"
 *               phone:
 *                 type: string
 *                 example: "521234567890"
 *               role:
 *                 type: string
 *                 enum: [ADMIN, OPERATOR, CLIENT]
 *                 default: CLIENT
 *               plan:
 *                 type: string
 *                 enum: [FREE, BASIC, PREMIUM, ENTERPRISE]
 *                 default: FREE
 *               planExpiresAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-12-31T23:59:59.000Z"
 *           examples:
 *             cliente_basic:
 *               summary: Cliente con plan BASIC
 *               value:
 *                 name: "Empresa XYZ"
 *                 email: "contacto@empresaxyz.com"
 *                 password: "Empresa2026!!"
 *                 phone: "521234567890"
 *                 plan: "BASIC"
 *                 planExpiresAt: "2026-12-31T23:59:59.000Z"
 *             operador:
 *               summary: Crear operador interno
 *               value:
 *                 name: "Operador 1"
 *                 email: "op1@chatfast.io"
 *                 password: "Operador2026!!"
 *                 role: "OPERATOR"
 *                 plan: "ENTERPRISE"
 *     responses:
 *       201:
 *         description: Cliente creado exitosamente
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Cliente creado exitosamente"
 *               data:
 *                 $ref: '#/components/schemas/Client'
 *       403:
 *         description: Solo ADMIN puede crear clientes
 *       409:
 *         description: El email ya está registrado
 */
router.post('/', authorize('ADMIN'), validateRequest(createClientSchema), clientController.create);

// ─── GET /clients/:id ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/clients/{id}:
 *   get:
 *     summary: Obtener cliente por ID
 *     description: |
 *       - **ADMIN**: puede obtener cualquier cliente.
 *       - **CLIENT**: solo puede obtener su propio perfil.
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "4990a981-80c3-4f51-825d-1f593f11eb7c"
 *     responses:
 *       200:
 *         description: Datos del cliente
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 $ref: '#/components/schemas/Client'
 *       403:
 *         description: No tienes permiso para ver este cliente
 *       404:
 *         description: Cliente no encontrado
 */
router.get('/:id', validateRequest(clientParamSchema), clientController.getById);

// ─── PUT /clients/:id ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/clients/{id}:
 *   put:
 *     summary: Actualizar cliente
 *     description: |
 *       Actualiza los datos de un cliente.
 *
 *       **Permisos por campo:**
 *       | Campo | ADMIN | CLIENT |
 *       |-------|-------|--------|
 *       | name | ✅ | ✅ |
 *       | phone | ✅ | ✅ |
 *       | password | ✅ | ✅ |
 *       | email | ✅ | ❌ |
 *       | role | ✅ | ❌ |
 *       | plan | ✅ | ❌ |
 *       | planExpiresAt | ✅ | ❌ |
 *       | active | ✅ | ❌ |
 *
 *       Si un CLIENT intenta enviar campos protegidos, se ignoran silenciosamente.
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Nombre Actualizado"
 *               phone:
 *                 type: string
 *                 example: "521234567890"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "NuevoPassword2026!!"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Solo ADMIN
 *               role:
 *                 type: string
 *                 enum: [ADMIN, OPERATOR, CLIENT]
 *                 description: Solo ADMIN
 *               plan:
 *                 type: string
 *                 enum: [FREE, BASIC, PREMIUM, ENTERPRISE]
 *                 description: Solo ADMIN
 *               planExpiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Solo ADMIN
 *               active:
 *                 type: boolean
 *                 description: Solo ADMIN
 *     responses:
 *       200:
 *         description: Cliente actualizado
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Cliente actualizado"
 *               data:
 *                 $ref: '#/components/schemas/Client'
 *       403:
 *         description: No tienes permiso para editar este cliente
 *       404:
 *         description: Cliente no encontrado
 *       409:
 *         description: El email ya está en uso
 */
router.put('/:id', validateRequest(updateClientSchema), clientController.update);

// ─── DELETE /clients/:id ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/clients/{id}:
 *   delete:
 *     summary: Eliminar cliente (ADMIN)
 *     description: |
 *       Elimina permanentemente un cliente y todas sus instancias asociadas (cascade).
 *       Esta operación no se puede deshacer. Para desactivar temporalmente, usa `/suspend`.
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Cliente eliminado (sin contenido)
 *       403:
 *         description: Solo ADMIN puede eliminar clientes
 *       404:
 *         description: Cliente no encontrado
 */
router.delete('/:id', authorize('ADMIN'), validateRequest(clientParamSchema), clientController.delete);

// ─── POST /clients/:id/suspend ────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/clients/{id}/suspend:
 *   post:
 *     summary: Suspender cuenta (ADMIN)
 *     description: |
 *       Suspende la cuenta de un cliente:
 *       - El cliente no puede hacer login mientras esté suspendido.
 *       - Todas sus sesiones activas (refreshTokens) se invalidan inmediatamente.
 *       - Sus instancias de WhatsApp siguen existiendo pero no puede gestionarlas.
 *
 *       Para reactivar, usa `POST /clients/:id/reactivate`.
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Cliente suspendido
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Cliente suspendido"
 *               data:
 *                 id: "4990a981-80c3-4f51-825d-1f593f11eb7c"
 *                 suspended: true
 *                 suspendedAt: "2026-03-07T18:00:00.000Z"
 *       409:
 *         description: El cliente ya está suspendido
 *       403:
 *         description: Solo ADMIN
 *       404:
 *         description: Cliente no encontrado
 */
router.post('/:id/suspend', authorize('ADMIN'), validateRequest(clientParamSchema), clientController.suspend);

// ─── POST /clients/:id/reactivate ─────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/clients/{id}/reactivate:
 *   post:
 *     summary: Reactivar cuenta suspendida (ADMIN)
 *     description: |
 *       Levanta la suspensión de un cliente.
 *       El cliente podrá volver a hacer login normalmente.
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Cliente reactivado
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Cliente reactivado"
 *               data:
 *                 id: "4990a981-80c3-4f51-825d-1f593f11eb7c"
 *                 suspended: false
 *                 suspendedAt: null
 *       409:
 *         description: El cliente no está suspendido
 *       403:
 *         description: Solo ADMIN
 *       404:
 *         description: Cliente no encontrado
 */
router.post('/:id/reactivate', authorize('ADMIN'), validateRequest(clientParamSchema), clientController.reactivate);

export default router;
