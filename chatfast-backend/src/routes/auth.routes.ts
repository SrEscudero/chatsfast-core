import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from '../validators/auth.validator';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Registro, login, tokens JWT y perfil del usuario autenticado
 */

// ─── POST /register ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Crear cuenta nueva
 *     description: |
 *       Registra un nuevo cliente en la plataforma.
 *       La contraseña se hashea con bcrypt (12 rounds) antes de guardarse.
 *       El rol inicial siempre es `CLIENT` y el plan `FREE`.
 *     tags: [Auth]
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
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: "Kelvis Escudero"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "kelvis@chatfast.io"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 100
 *                 example: "MiPassword2026!!"
 *                 description: Mínimo 8 caracteres
 *               phone:
 *                 type: string
 *                 example: "521234567890"
 *                 description: Opcional. Número con código de país sin +
 *           examples:
 *             registro_completo:
 *               summary: Con teléfono
 *               value:
 *                 name: "Kelvis Escudero"
 *                 email: "kelvis@chatfast.io"
 *                 password: "MiPassword2026!!"
 *                 phone: "521234567890"
 *             registro_minimo:
 *               summary: Solo campos obligatorios
 *               value:
 *                 name: "Juan Pérez"
 *                 email: "juan@empresa.com"
 *                 password: "Empresa2026!!"
 *     responses:
 *       201:
 *         description: Cuenta creada exitosamente
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Cuenta creada exitosamente"
 *               data:
 *                 id: "4990a981-80c3-4f51-825d-1f593f11eb7c"
 *                 name: "Kelvis Escudero"
 *                 email: "kelvis@chatfast.io"
 *                 phone: "521234567890"
 *                 role: "CLIENT"
 *                 plan: "FREE"
 *                 createdAt: "2026-03-07T17:00:00.000Z"
 *       409:
 *         description: El email ya está registrado
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error:
 *                 code: "DUPLICATE"
 *                 message: "Ya existe una cuenta con ese email"
 *       422:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error:
 *                 code: "VALIDATION_ERROR"
 *                 message: "Validation error"
 */
router.post('/register', validateRequest(registerSchema), authController.register);

// ─── POST /login ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     description: |
 *       Autentica al usuario y devuelve un par de tokens:
 *       - **accessToken**: JWT de corta duración (15 min). Úsalo en el header `Authorization: Bearer`.
 *       - **refreshToken**: JWT de larga duración (7 días). Guárdalo para renovar el accessToken sin reloguear.
 *
 *       **Flujo recomendado:**
 *       1. Llama a `/login` → guarda ambos tokens
 *       2. Usa `accessToken` en cada request
 *       3. Cuando el accessToken expire (401), llama a `/refresh` con el `refreshToken`
 *       4. En `/logout` invalida el `refreshToken` en la base de datos
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "kelvis@chatfast.io"
 *               password:
 *                 type: string
 *                 example: "MiPassword2026!!"
 *           example:
 *             email: "kelvis@chatfast.io"
 *             password: "MiPassword2026!!"
 *     responses:
 *       200:
 *         description: Login exitoso — copia el accessToken y pégalo en el botón "Authorize" de Swagger
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Login exitoso"
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   id: "4990a981-80c3-4f51-825d-1f593f11eb7c"
 *                   name: "Kelvis Escudero"
 *                   email: "kelvis@chatfast.io"
 *                   role: "CLIENT"
 *                   plan: "FREE"
 *       401:
 *         description: Credenciales incorrectas
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error:
 *                 code: "UNAUTHORIZED"
 *                 message: "Credenciales incorrectas"
 *       403:
 *         description: Cuenta suspendida o inactiva
 */
router.post('/login', validateRequest(loginSchema), authController.login);

// ─── POST /refresh ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Renovar accessToken
 *     description: |
 *       Usa el `refreshToken` (obtenido en `/login`) para obtener un nuevo `accessToken`
 *       sin necesidad de volver a introducir las credenciales.
 *
 *       El refreshToken se valida contra la base de datos (tabla `Session`).
 *       Si el usuario hizo logout, este endpoint retornará 401 aunque el JWT sea técnicamente válido.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Nuevo accessToken generado
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Token renovado"
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       401:
 *         description: refreshToken inválido, expirado o sesión cerrada
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error:
 *                 code: "UNAUTHORIZED"
 *                 message: "Sesión no encontrada o expirada"
 */
router.post('/refresh', validateRequest(refreshSchema), authController.refresh);

// ─── POST /logout ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Cerrar sesión
 *     description: |
 *       Invalida el `refreshToken` eliminando la sesión de la base de datos.
 *       Después de logout, el `refreshToken` ya no podrá usarse en `/refresh`.
 *       El `accessToken` sigue siendo técnicamente válido hasta que expire (máx 15 min).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Sesión cerrada"
 *               data: null
 */
router.post('/logout', validateRequest(logoutSchema), authController.logout);

// ─── GET /me ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Obtener perfil del usuario autenticado
 *     description: |
 *       Retorna los datos completos del usuario dueño del `accessToken`.
 *       Requiere header `Authorization: Bearer <accessToken>`.
 *
 *       **Para probar en Swagger:** haz login primero, copia el `accessToken`
 *       y pégalo en el botón "Authorize" (candado) en la parte superior.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario autenticado
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 id: "4990a981-80c3-4f51-825d-1f593f11eb7c"
 *                 name: "Kelvis Escudero"
 *                 email: "kelvis@chatfast.io"
 *                 phone: "521234567890"
 *                 role: "CLIENT"
 *                 plan: "FREE"
 *                 planExpiresAt: null
 *                 active: true
 *                 suspended: false
 *                 createdAt: "2026-03-07T17:00:00.000Z"
 *                 updatedAt: "2026-03-07T17:00:00.000Z"
 *       401:
 *         description: Token ausente, inválido o expirado
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error:
 *                 code: "UNAUTHORIZED"
 *                 message: "Token de autenticación requerido."
 */
router.get('/me', authenticate, authController.me);

export default router;
