/**
 * ============================================================================
 * 📦 ROUTER DE INSTANCIAS - CHATFAST API
 * ============================================================================
 * 
 * PROPÓSITO:
 * Este módulo define todas las rutas HTTP relacionadas con la gestión de 
 * instancias de WhatsApp. Cada ruta está documentada con OpenAPI/Swagger
 * para generación automática de documentación.
 * 
 * ARQUITECTURA:
 * Router → Middleware → Controller → Service → Repository → Database
 * 
 * PATRONES UTILIZADOS:
 * - Dependency Injection (inyección de dependencias)
 * - Middleware Chain (cadena de middlewares)
 * - Async Handler (manejo de errores asíncronos)
 * - Request Validation (validación de solicitudes con Zod)
 * 
 * AUTOR: Kelvis Tech
 * VERSIÓN: 2.0.0
 * ÚLTIMA ACTUALIZACIÓN: 2026-03-07
 * ============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { instanceController } from '../controllers/instances.controller';
import { validateRequest } from '../middleware/validation';
import { rateLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { requireOwnership } from '../middleware/ownership';
import { 
  createInstanceSchema, 
  getInstanceSchema, 
  updateInstanceSchema,
  queryInstanceSchema,
  instanceActionSchema
} from '../validators/instance.validator';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../config/logger';

// ============================================================================
// 🎯 CONFIGURACIÓN DEL ROUTER
// ============================================================================

/**
 * Creamos una instancia de Express Router.
 * 
 * ¿Por qué Router?
 * - Permite modularizar las rutas en archivos separados
 * - Facilita el mantenimiento y testing
 * - Permite aplicar middlewares específicos por ruta
 */
const router = Router();

// ============================================================================
// 🛡️ MIDDLEWARES GLOBALES PARA ESTE ROUTER
// ============================================================================

/**
 * ORDEN DE EJECUCIÓN DE MIDDLEWARES:
 * 
 * 1. authenticate → Verifica que el usuario esté logueado (JWT)
 * 2. rateLimiter → Limita peticiones para evitar abuso (DDoS)
 * 3. validateRequest → Valida que los datos cumplan el schema (Zod)
 * 4. asyncHandler → Captura errores de funciones asíncronas
 * 5. controller → Ejecuta la lógica de negocio
 * 
 * FLUJO:
 * Request → Auth → RateLimit → Validation → Controller → Response
 */

// Middleware de autenticación (requiere token JWT válido)
// router.use(authenticate); // Descomentar en producción

// Rate limiting específico para instancias (más estricto)


// Logging middleware para auditoría
router.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Registrar inicio de petición
  logger.debug('Instance request started', {
    method: req.method,
    path: req.path,
    requestId: res.locals.requestId,
    userId: (req as any).user?.id,
  });

  // Registrar fin de petición después de completar
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Instance request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      requestId: res.locals.requestId,
    });
  });

  next();
});

// ============================================================================
// 📚 DOCUMENTACIÓN SWAGGER / OPENAPI
// ============================================================================

/**
 * @swagger
 * tags:
 *   name: Instancias
 *   description: >
 *     Gestión de instancias de WhatsApp via Evolution API.
 *     Cada instancia representa una conexión independiente (un número telefónico).
 *     Flujo: crear instancia, obtener QR, escanear con WhatsApp, enviar mensajes.
 *     Estados posibles: PENDING, CONNECTING, CONNECTED, DISCONNECTED, ERROR.
 */

// ============================================================================
// 📍 RUTAS PRINCIPALES
// ============================================================================

// ----------------------------------------------------------------------------
// POST /api/v1/instances
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances:
 *   post:
 *     summary: Crear nueva instancia de WhatsApp
 *     description: |
 *       ## Creación de Instancia
 *       
 *       Crea una nueva instancia en Evolution API y registra en la base de datos.
 *       
 *       ### Proceso Interno:
 *       1. Valida datos de entrada (Zod)
 *       2. Verifica autenticación del usuario
 *       3. Verifica unicidad del nombre
 *       4. Crea instancia en Evolution API
 *       5. Configura webhook automáticamente
 *       6. Guarda registro en PostgreSQL
 *       7. Retorna datos de la instancia
 *       
 *       ### Consideraciones:
 *       - El nombre debe ser único (no puede repetirse)
 *       - Se genera un token API único para esta instancia
 *       - El webhook se configura automáticamente
 *       - Estado inicial: PENDING (esperando escanear QR)
 *     tags: [Instancias]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - clientId
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *                 pattern: "^[a-zA-Z0-9_-]+$"
 *                 description: Nombre único de la instancia (solo letras, números, guiones)
 *                 example: cliente_whatsapp_001
 *               clientId:
 *                 type: string
 *                 format: uuid
 *                 description: UUID del cliente propietario de esta instancia
 *                 example: 550e8400-e29b-41d4-a716-446655440000
 *               connectionType:
 *                 type: string
 *                 enum: [BAILEYS, WHATSAPP_CLOUD]
 *                 default: BAILEYS
 *                 description: |
 *                   Tipo de conexión:
 *                   - BAILEYS: WhatsApp Web (recomendado para la mayoría de casos)
 *                   - WHATSAPP_CLOUD: WhatsApp Cloud API (oficial de Meta)
 *               config:
 *                 type: object
 *                 description: Configuración adicional opcional
 *                 properties:
 *                   rejectCalls:
 *                     type: boolean
 *                     default: false
 *                   alwaysOnline:
 *                     type: boolean
 *                     default: false
 *                   readMessages:
 *                     type: boolean
 *                     default: false
 *     responses:
 *       201:
 *         description: |
 *           ✅ Instancia creada exitosamente
 *           
 *           La instancia está lista para escanear el código QR.
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
 *                   example: Instancia creada exitosamente
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [PENDING, CONNECTING, CONNECTED, DISCONNECTED, ERROR]
 *                     apiKey:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: ❌ Datos inválidos (validación falló)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: VALIDATION_ERROR
 *                     message:
 *                       type: string
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           field:
 *                             type: string
 *                             example: name
 *                           message:
 *                             type: string
 *                             example: El nombre debe tener al menos 3 caracteres
 *       401:
 *         description: ❌ No autorizado (token inválido o ausente)
 *       404:
 *         description: ❌ Cliente no encontrado
 *       409:
 *         description: ❌ Conflicto (nombre de instancia ya existe)
 *       500:
 *         description: ❌ Error interno del servidor
 *       503:
 *         description: ❌ Evolution API no disponible
 *     x-codeSamples:
 *       - lang: JavaScript
 *         label: Node.js (Axios)
 *         source: |
 *           const axios = require('axios');
 *           
 *           const response = await axios.post(
 *             'http://localhost:3001/api/v1/instances',
 *             {
 *               name: 'mi_empresa_01',
 *               clientId: '550e8400-e29b-41d4-a716-446655440000',
 *               connectionType: 'BAILEYS'
 *             },
 *             {
 *               headers: {
 *                 'Authorization': 'Bearer TU_TOKEN_JWT',
 *                 'Content-Type': 'application/json'
 *               }
 *             }
 *           );
 *           
 *           console.log(response.data);
 *       - lang: Python
 *         label: Python (Requests)
 *         source: |
 *           import requests
 *           
 *           response = requests.post(
 *             'http://localhost:3001/api/v1/instances',
 *             json={
 *               'name': 'mi_empresa_01',
 *               'clientId': '550e8400-e29b-41d4-a716-446655440000'
 *             },
 *             headers={
 *               'Authorization': 'Bearer TU_TOKEN_JWT'
 *             }
 *           )
 *           
 *           print(response.json())
 *       - lang: cURL
 *         label: cURL
 *         source: |
 *           curl -X POST http://localhost:3001/api/v1/instances \
 *             -H "Authorization: Bearer TU_TOKEN_JWT" \
 *             -H "Content-Type: application/json" \
 *             -d '{
 *               "name": "mi_empresa_01",
 *               "clientId": "550e8400-e29b-41d4-a716-446655440000"
 *             }'
 */
router.post(
  '/',
  authenticate, // ✅ Verifica token JWT
  validateRequest(createInstanceSchema), // ✅ Valida body con Zod
  asyncHandler(instanceController.create) // ✅ Maneja errores asíncronos
);

// ----------------------------------------------------------------------------
// GET /api/v1/instances
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances:
 *   get:
 *     summary: Obtener todas las instancias (con paginación y filtros)
 *     description: |
 *       ## Listado de Instancias
 *       
 *       Recupera una lista paginada de instancias con filtros opcionales.
 *       
 *       ### Parámetros de Consulta:
 *       - **page**: Número de página (default: 1)
 *       - **limit**: Items por página (default: 10, max: 100)
 *       - **status**: Filtrar por estado (CONNECTED, DISCONNECTED, etc.)
 *       - **clientId**: Filtrar por cliente específico
 *       - **search**: Búsqueda por nombre o número de teléfono
 *       - **connectionType**: Filtrar por tipo de conexión
 *       
 *       ### Respuesta:
 *       Incluye metadatos de paginación para navegar por los resultados.
 *     tags: [Instancias]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Items por página
 *         example: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONNECTING, CONNECTED, DISCONNECTED, ERROR]
 *         description: Filtrar por estado de conexión
 *         example: CONNECTED
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtrar por ID de cliente
 *         example: 550e8400-e29b-41d4-a716-446655440000
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 3
 *         description: Buscar por nombre o número de teléfono
 *         example: cliente_001
 *       - in: query
 *         name: connectionType
 *         schema:
 *           type: string
 *           enum: [BAILEYS, WHATSAPP_CLOUD]
 *         description: Filtrar por tipo de conexión
 *         example: BAILEYS
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, name, status]
 *           default: createdAt
 *         description: Campo para ordenar
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Orden ascendente o descendente
 *     responses:
 *       200:
 *         description: ✅ Lista de instancias obtenida exitosamente
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
 *                   example: Instancias obtenidas exitosamente
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           status:
 *                             type: string
 *                           connectionType:
 *                             type: string
 *                           phoneNumber:
 *                             type: string
 *                           client:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         total:
 *                           type: integer
 *                           example: 50
 *                         totalPages:
 *                           type: integer
 *                           example: 5
 *                         hasNextPage:
 *                           type: boolean
 *                         hasPrevPage:
 *                           type: boolean
 *       400:
 *         description: ❌ Parámetros de consulta inválidos
 *       401:
 *         description: ❌ No autorizado
 *     x-codeSamples:
 *       - lang: JavaScript
 *         label: Node.js
 *         source: |
 *           // Obtener todas las instancias conectadas
 *           const response = await axios.get(
 *             'http://localhost:3001/api/v1/instances?status=CONNECTED&limit=20',
 *             {
 *               headers: { 'Authorization': 'Bearer TU_TOKEN_JWT' }
 *             }
 *           );
 *           
 *           console.log(response.data.data.items);
 */
router.get(
  '/',
  authenticate,
  validateRequest(queryInstanceSchema), // ✅ Valida query params
  asyncHandler(instanceController.getAll)
);

// ─── Ownership guard para todas las rutas /:id ──────────────────────────────
// Se ejecuta antes de cualquier ruta que tenga :id en el path.
// ADMIN hace bypass. Para CLIENT/OPERATOR verifica instance.clientId === req.user.id
router.use('/:id', authenticate, requireOwnership('id'));

// ----------------------------------------------------------------------------
// GET /api/v1/instances/:id
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}:
 *   get:
 *     summary: Obtener detalles de una instancia específica
 *     description: |
 *       ## Detalles de Instancia
 *       
 *       Recupera información completa de una instancia por su UUID.
 *       
 *       ### Información Incluida:
 *       - Datos básicos (nombre, estado, tipo de conexión)
 *       - Información del cliente propietario
 *       - Número de teléfono conectado (si aplica)
 *       - Fecha de última actividad
 *       - Configuración actual
 *       - Métricas recientes (mensajes enviados/recibidos)
 *       
 *       ### Comportamiento:
 *       - Sincroniza estado con Evolution API antes de retornar
 *       - Actualiza `lastSeen` si la instancia está conectada
 *     tags: [Instancias]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID único de la instancia
 *         example: 6ba7b810-9dad-11d1-80b4-00c04fd430c8
 *     responses:
 *       200:
 *         description: ✅ Instancia encontrada
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
 *                     name:
 *                       type: string
 *                     status:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                       example: "+5215512345678"
 *                     client:
 *                       type: object
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         messagesIn:
 *                           type: integer
 *                         messagesOut:
 *                           type: integer
 *                     lastSeen:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: ❌ Instancia no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: NOT_FOUND
 *                     message:
 *                       type: string
 *                       example: Instancia no encontrada
 *       401:
 *         description: ❌ No autorizado
 *       403:
 *         description: ❌ Acceso denegado (no es propietario)
 */
router.get(
  '/:id',
  authenticate,
  validateRequest(getInstanceSchema), // ✅ Valida UUID en path
  asyncHandler(instanceController.getById)
);

// ----------------------------------------------------------------------------
// PUT /api/v1/instances/:id
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}:
 *   put:
 *     summary: Actualizar configuración de una instancia
 *     description: |
 *       ## Actualización Parcial
 *       
 *       Permite actualizar campos específicos de una instancia.
 *       
 *       ### Campos Actualizables:
 *       - **name**: Nombre de la instancia (debe ser único)
 *       - **status**: Estado manual (para override)
 *       - **config**: Objeto de configuración JSON
 *       - **webhookUrl**: URL personalizada para webhooks
 *       
 *       ### Restricciones:
 *       - No se puede cambiar el clientId (propiedad)
 *       - No se puede cambiar connectionType después de creado
 *       - El nombre debe permanecer único
 *     tags: [Instancias]
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
 *                 minLength: 3
 *                 maxLength: 50
 *               status:
 *                 type: string
 *                 enum: [PENDING, CONNECTING, CONNECTED, DISCONNECTED, ERROR]
 *               config:
 *                 type: object
 *               webhookUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: ✅ Instancia actualizada
 *       400:
 *         description: ❌ Datos inválidos
 *       404:
 *         description: ❌ Instancia no encontrada
 *       409:
 *         description: ❌ Nombre duplicado
 */
router.put(
  '/:id',
  authenticate,
  validateRequest(updateInstanceSchema),
  asyncHandler(instanceController.update)
);

// ----------------------------------------------------------------------------
// DELETE /api/v1/instances/:id
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}:
 *   delete:
 *     summary: Eliminar instancia permanentemente
 *     description: |
 *       ## Eliminación de Instancia
 *       
 *       Elimina una instancia de forma permanente.
 *       
 *       ### Proceso de Eliminación:
 *       1. Verifica que la instancia existe
 *       2. Desconecta de Evolution API (logout)
 *       3. Elimina de Evolution API
 *       4. Elimina registros de la base de datos
 *       5. Limpia cache de Redis (si existe)
 *       
 *       ### ⚠️ ADVERTENCIA:
 *       - Esta acción es **IRREVERSIBLE**
 *       - Se pierden todos los historiales asociados
 *       - El número deberá escanear QR nuevamente si se recrea
 *       
 *       ### Soft Delete (Recomendado para Producción):
 *       En lugar de eliminar, considera implementar soft delete:
 *       - Marcar como `deleted: true`
 *       - Mantener datos por período de retención
 *       - Permitir recuperación dentro de X días
 *     tags: [Instancias]
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
 *         description: ✅ Instancia eliminada exitosamente
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
 *                   example: Instancia eliminada exitosamente
 *       404:
 *         description: ❌ Instancia no encontrada
 *       401:
 *         description: ❌ No autorizado
 *       403:
 *         description: ❌ No tiene permisos para eliminar
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validateRequest(getInstanceSchema),
  asyncHandler(instanceController.delete)
);

// ============================================================================
// 🔌 RUTAS DE CONEXIÓN / QR CODE
// ============================================================================

// ----------------------------------------------------------------------------
// GET /api/v1/instances/:id/qr
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}/qr:
 *   get:
 *     summary: Obtener código QR para escanear y conectar
 *     description: |
 *       ## Obtención de QR Code
 *       
 *       Recupera el código QR necesario para conectar WhatsApp.
 *       
 *       ### Flujo de Conexión:
 *       ```
 *       1. POST /instances → Crea instancia (estado: PENDING)
 *       2. GET /instances/:id/qr → Obtiene QR (estado: CONNECTING)
 *       3. Usuario escanea QR con WhatsApp
 *       4. Evolution API envía webhook → Estado: CONNECTED
 *       5. Instancia lista para enviar/recibir mensajes
 *       ```
 *       
 *       ### Formato del QR:
 *       - Retornado en Base64 (PNG)
 *       - Válido por ~60 segundos
 *       - Debe refrescarse si expira
 *       
 *       ### Uso en Frontend:
 *       ```html
 *       <img src="data:image/png;base64,{qrCode}" alt="QR Code" />
 *       ```
 *       
 *       ### Polling Recomendado:
 *       El QR expira rápido. Implementa polling cada 30 segundos:
 *       ```javascript
 *       const pollQR = async () => {
 *         const response = await fetch(`/api/v1/instances/${id}/qr`);
 *         const { qrCode } = await response.json();
 *         setQrCode(qrCode);
 *         
 *         if (!isConnected) {
 *           setTimeout(pollQR, 30000); // 30 segundos
 *         }
 *       };
 *       ```
 *     tags: [Instancias]
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
 *         description: ✅ QR Code generado exitosamente
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
 *                     instanceId:
 *                       type: string
 *                     instanceName:
 *                       type: string
 *                     qrCode:
 *                       type: string
 *                       description: Base64 del código QR (PNG)
 *                       example: "iVBORw0KGgoAAAANSUhEUgAA..."
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       description: Cuándo expira este QR
 *                     status:
 *                       type: string
 *                       enum: [CONNECTING, CONNECTED]
 *       400:
 *         description: ❌ La instancia ya está conectada (no necesita QR)
 *       404:
 *         description: ❌ Instancia no encontrada
 *       408:
 *         description: ⚠️ QR expirado (solicitar uno nuevo)
 *       503:
 *         description: ❌ Evolution API no disponible
 *     x-codeSamples:
 *       - lang: JavaScript
 *         label: React Component Example
 *         source: |
 *           function QRCodeScanner({ instanceId }) {
 *             const [qrCode, setQrCode] = useState(null);
 *             const [status, setStatus] = useState('CONNECTING');
 *             
 *             useEffect(() => {
 *               const fetchQR = async () => {
 *                 const res = await fetch(`/api/v1/instances/${instanceId}/qr`, {
 *                   headers: { 'Authorization': `Bearer ${token}` }
 *                 });
 *                 const { data } = await res.json();
 *                 setQrCode(data.qrCode);
 *                 setStatus(data.status);
 *               };
 *               
 *               fetchQR();
 *               const interval = setInterval(fetchQR, 30000);
 *               return () => clearInterval(interval);
 *             }, [instanceId]);
 *             
 *             return (
 *               <div>
 *                 {qrCode && (
 *                   <img 
 *                     src={`data:image/png;base64,${qrCode}`} 
 *                     alt="Scan QR" 
 *                   />
 *                 )}
 *                 <p>Estado: {status}</p>
 *               </div>
 *             );
 *           }
 */
router.get(
  '/:id/qr',
  authenticate,
  validateRequest(getInstanceSchema),
  asyncHandler(instanceController.getQR)
);

// ----------------------------------------------------------------------------
// POST /api/v1/instances/:id/connect
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}/connect:
 *   post:
 *     summary: Iniciar proceso de conexión
 *     description: |
 *       ## Forzar Reconexión
 *       
 *       Inicia o reinicia el proceso de conexión de una instancia.
 *       
 *       ### Casos de Uso:
 *       - Reconectar después de una desconexión inesperada
 *       - Forzar refresh de sesión
 *       - Recuperar instancia en estado ERROR
 *       
 *       ### Comportamiento:
 *       - Si está CONNECTED → No hace nada (ya conectada)
 *       - Si está DISCONNECTED → Intenta reconectar
 *       - Si está ERROR → Limpia estado e intenta de nuevo
 *     tags: [Instancias]
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
 *         description: ✅ Proceso de conexión iniciado
 *       400:
 *         description: ⚠️ Ya está conectada
 *       404:
 *         description: ❌ Instancia no encontrada
 */
router.post(
  '/:id/connect',
  authenticate,
  validateRequest(getInstanceSchema),
  asyncHandler(instanceController.connect)
);

// ----------------------------------------------------------------------------
// POST /api/v1/instances/:id/disconnect
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}/disconnect:
 *   post:
 *     summary: Desconectar instancia manualmente
 *     description: |
 *       ## Desconexión Controlada
 *       
 *       Desconecta una instancia de WhatsApp de forma controlada.
 *       
 *       ### Diferencia con Eliminar:
 *       - **Disconnect**: Mantiene la instancia, solo cierra sesión
 *       - **Delete**: Elimina permanentemente todo
 *       
 *       ### Casos de Uso:
 *       - Cierre temporal (mantenimiento)
 *       - Cambio de dispositivo
 *       - Suspensión temporal del servicio
 *     tags: [Instancias]
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
 *         description: ✅ Instancia desconectada
 *       400:
 *         description: ⚠️ Ya está desconectada
 *       404:
 *         description: ❌ Instancia no encontrada
 */
router.post(
  '/:id/disconnect',
  authenticate,
  validateRequest(getInstanceSchema),
  asyncHandler(instanceController.disconnect)
);

// ----------------------------------------------------------------------------
// POST /api/v1/instances/:id/restart
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}/restart:
 *   post:
 *     summary: Reiniciar instancia (disconnect + connect)
 *     description: |
 *       ## Reinicio Completo
 *       
 *       Realiza un ciclo completo de desconexión y reconexión.
 *       
 *       ### Proceso:
 *       1. Desconecta de WhatsApp
 *       2. Espera 2 segundos
 *       3. Inicia nueva conexión
 *       4. Retorna nuevo QR (si es necesario)
 *       
 *       ### Casos de Uso:
 *       - Instancia "trabada" en estado inconsistente
 *       - Después de actualizaciones de Evolution API
 *       - Problemas de sincronización
 */
router.post(
  '/:id/restart',
  authenticate,
  validateRequest(getInstanceSchema),
  asyncHandler(instanceController.restart)
);

// ============================================================================
// 📊 RUTAS DE MÉTRICAS Y ESTADO
// ============================================================================

// ----------------------------------------------------------------------------
// GET /api/v1/instances/:id/status
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}/status:
 *   get:
 *     summary: Obtener estado en tiempo real
 *     description: |
 *       ## Estado de Conexión
 *       
 *       Consulta el estado actual sincronizado con Evolution API.
 *       
 *       ### Estados Posibles:
 *       | Estado | Descripción |
 *       |--------|-------------|
 *       | PENDING | Instancia creada, esperando QR |
 *       | CONNECTING | QR generado, esperando escaneo |
 *       | CONNECTED | WhatsApp conectado y operativo |
 *       | DISCONNECTED | Sesión cerrada (manual o timeout) |
 *       | ERROR | Error de conexión (requiere atención) |
 *       
 *       ### Información Adicional:
 *       - Battery level (si disponible)
 *       - Platform (Android/iOS)
 *       - Last seen timestamp
 *       - Connection uptime
 */
router.get(
  '/:id/status',
  authenticate,
  validateRequest(getInstanceSchema),
  asyncHandler(instanceController.getStatus)
);

// ----------------------------------------------------------------------------
// GET /api/v1/instances/:id/metrics
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}/metrics:
 *   get:
 *     summary: Obtener métricas de uso
 *     description: |
 *       ## Métricas y Estadísticas
 *       
 *       Recupera estadísticas de uso de la instancia.
 *       
 *       ### Métricas Incluidas:
 *       - Mensajes enviados (últimas 24h, 7d, 30d)
 *       - Mensajes recibidos
 *       - Errores de envío
 *       - Tiempo de actividad (uptime)
 *       - Última actividad
 *       
 *       ### Períodos Soportados:
 *       - `24h` → Últimas 24 horas
 *       - `7d` → Últimos 7 días
 *       - `30d` → Últimos 30 días
 *       - `all` → Desde la creación
 */
router.get(
  '/:id/metrics',
  authenticate,
  validateRequest(getInstanceSchema),
  asyncHandler(instanceController.getMetrics)
);

// ============================================================================
// 🔔 RUTAS DE WEBHOOKS
// ============================================================================

// ----------------------------------------------------------------------------
// GET /api/v1/instances/:id/webhook
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}/webhook:
 *   get:
 *     summary: Obtener configuración de webhook actual
 *     tags: [Instancias]
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
 *         description: ✅ Configuración de webhook obtenida
 */
router.get(
  '/:id/webhook',
  authenticate,
  validateRequest(getInstanceSchema),
  asyncHandler(instanceController.getWebhook)
);

// ----------------------------------------------------------------------------
// PUT /api/v1/instances/:id/webhook
// ----------------------------------------------------------------------------
/**
 * @swagger
 * /api/v1/instances/{id}/webhook:
 *   put:
 *     summary: Actualizar configuración de webhook
 *     description: |
 *       ## Configurar Webhook
 *       
 *       Establece la URL donde Evolution API enviará eventos.
 *       
 *       ### Eventos Disponibles:
 *       - `messages.upsert` → Mensajes nuevos
 *       - `messages.update` → Actualización de mensajes
 *       - `connection.update` → Cambios de estado
 *       - `qr.update` → Actualización de QR
 *       - `call.upsert` → Llamadas entrantes
 *     tags: [Instancias]
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
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: ✅ Webhook configurado
 */
router.put(
  '/:id/webhook',
  authenticate,
  validateRequest(getInstanceSchema),
  asyncHandler(instanceController.updateWebhook)
);

// ============================================================================
// 🏷️ EXPORTAR ROUTER
// ============================================================================

/**
 * Exportamos el router para ser montado en la aplicación principal.
 * 
 * Uso en app.ts:
 * ```typescript
 * import instancesRoutes from './routes/instances.routes';
 * app.use('/api/v1/instances', instancesRoutes);
 * ```
 */
export default router;

// ============================================================================
// 📝 NOTAS DE IMPLEMENTACIÓN
// ============================================================================

/**
 * ============================================================================
 * CHECKLIST DE SEGURIDAD PARA PRODUCCIÓN
 * ============================================================================
 * 
 * [ ] Autenticación activada en todas las rutas
 * [ ] Rate limiting configurado apropiadamente
 * [ ] Validación de entrada con Zod en todos los endpoints
 * [ ] Logs de auditoría para operaciones críticas
 * [ ] Sanitización de inputs (prevenir XSS, SQL Injection)
 * [ ] HTTPS obligatorio en producción
 * [ ] CORS configurado correctamente
 * [ ] Headers de seguridad (Helmet) activados
 * [ ] Tokens JWT con expiración adecuada
 * [ ] Refresh tokens implementados
 * [ ] Webhooks con validación de firma HMAC
 * 
 * ============================================================================
 * OPTIMIZACIONES RECOMENDADAS
 * ============================================================================
 * 
 * 1. CACHING:
 *    - Cache de instancias en Redis (TTL: 5 minutos)
 *    - Invalidar cache después de write operations
 * 
 * 2. PAGINACIÓN:
 *    - Cursor-based pagination para grandes volúmenes
 *    - Índices en PostgreSQL para campos de filtro
 * 
 * 3. RATE LIMITING:
 *    - Límites diferentes por rol (ADMIN vs CLIENT)
 *    - Límites más estrictos para operaciones costosas
 * 
 * 4. MONITOREO:
 *    - Métricas de Prometheus para cada endpoint
 *    - Alertas para errores > threshold
 *    - Distributed tracing (Jaeger/Zipkin)
 * 
 * 5. TESTING:
 *    - Unit tests para controllers (Jest)
 *    - Integration tests para rutas completas
 *    - Load tests para endpoints críticos (k6)
 * 
 * ============================================================================
 */