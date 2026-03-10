/**
 * ============================================================
 * messages.routes.ts
 * ============================================================
 * Rutas para envío de mensajes via Evolution API v2.
 *
 * MONTAJE en app.ts / routes/index.ts:
 *   app.use('/api/v1/instances/:instanceId/messages', messagesRouter)
 *
 * Así las rutas son relativas al instanceId:
 *   POST /api/v1/instances/:instanceId/messages/text
 *   POST /api/v1/instances/:instanceId/messages/media
 *   POST /api/v1/instances/:instanceId/messages/audio
 *   POST /api/v1/instances/:instanceId/messages/location
 *   POST /api/v1/instances/:instanceId/messages/reaction
 *
 * FLUJO DE UNA PETICIÓN:
 *   Request
 *     → authenticate (verifica JWT)
 *     → rateLimiter  (evita spam)
 *     → validateRequest (valida body con Zod)
 *     → messageController.sendXxx
 *     → messageService.sendXxx
 *     → evolutionApi.post('/message/sendXxx/{instanceName}', payload)
 *     → Response 200 con key.id del mensaje
 * ============================================================
 */

import { Router } from 'express';
import { messageController } from '../controllers/messages.controller';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import {
  sendTextSchema,
  sendMediaSchema,
  sendAudioSchema,
  sendLocationSchema,
  sendReactionSchema,
  sendPollSchema,
  sendContactSchema,
} from '../validators/message.validator';

const router = Router({ mergeParams: true }); // mergeParams = accede a :instanceId del router padre

router.use(authenticate);
router.use(rateLimiter);

// ============================================================
// SWAGGER — COMPONENTES DE MENSAJES
// ============================================================

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     MessageResponse:
 *       type: object
 *       description: Respuesta de Evolution API al enviar un mensaje exitoso
 *       properties:
 *         key:
 *           type: object
 *           properties:
 *             remoteJid:
 *               type: string
 *               example: "5215512345678@s.whatsapp.net"
 *               description: JID del destinatario en WhatsApp
 *             fromMe:
 *               type: boolean
 *               example: true
 *               description: true = mensaje enviado por nosotros
 *             id:
 *               type: string
 *               example: "BAE594145F4C59B4"
 *               description: ID único del mensaje en WhatsApp. Guardar para hacer replies o reacciones.
 *         message:
 *           type: object
 *           description: Contenido del mensaje (varía por tipo)
 *         messageTimestamp:
 *           type: string
 *           example: "1717689097"
 *           description: Unix timestamp del momento de envío
 *         status:
 *           type: string
 *           enum: [PENDING, SENT, DELIVERED, READ, ERROR]
 *           example: PENDING
 *           description: |
 *             Estado inicial siempre es PENDING.
 *             Los cambios de estado (DELIVERED, READ) llegan via webhook MESSAGES_UPDATE.
 *
 *     QuotedMessage:
 *       type: object
 *       description: Para responder (reply) a un mensaje previo
 *       properties:
 *         key:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               example: "BAE594145F4C59B4"
 *               description: ID del mensaje a citar. Obtenlo del webhook MESSAGES_UPSERT.
 *         message:
 *           type: object
 *           properties:
 *             conversation:
 *               type: string
 *               example: "Texto del mensaje original"
 */

/**
 * @swagger
 * tags:
 *   - name: Mensajes
 *     description: >
 *       Envío de mensajes de WhatsApp via instancias conectadas.
 *       Prerequisito: la instancia debe estar en estado CONNECTED.
 *       Formato del número: solo dígitos con código de país sin +, ejemplo 5215512345678.
 *       El campo delay simula "escribiendo..." en milisegundos (0 a 10000).
 */

// ============================================================
// POST /text — Mensaje de texto plano
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/messages/text:
 *   post:
 *     summary: Enviar mensaje de texto
 *     description: |
 *       Envía un mensaje de texto plano. Soporta URLs con preview automático,
 *       respuestas a mensajes previos y delay para simular escritura.
 *
 *       **Número de destino:**
 *       - Personal: `5215512345678` (México) o `5511999999999` (Brasil)
 *       - Grupo: `120363xxxxxx@g.us` (obtén el JID del grupo via webhook)
 *
 *       **Ejemplo curl:**
 *       ```bash
 *       curl -X POST http://localhost:3001/api/v1/instances/INSTANCE_ID/messages/text \
 *         -H "Authorization: Bearer $TOKEN" \
 *         -H "Content-Type: application/json" \
 *         -d '{"number":"5215512345678","text":"Hola desde ChatFast! 🚀","delay":1200}'
 *       ```
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID de la instancia conectada
 *         example: 4a9bbf4d-d3d1-4a9c-bced-aac6c28463e5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - number
 *               - text
 *             properties:
 *               number:
 *                 type: string
 *                 example: "5215512345678"
 *                 description: "Número con código de país, sin +. Ej: 52 (México) + número"
 *               text:
 *                 type: string
 *                 example: "Hola! Aquí ChatFast 🚀. ¿En qué te puedo ayudar?"
 *                 description: Texto del mensaje (máx 4096 chars)
 *               delay:
 *                 type: integer
 *                 example: 1200
 *                 description: |
 *                   ms de "escribiendo..." antes de enviar. 0 = inmediato.
 *                   Recomendado: 1000-1500ms para parecer más humano.
 *               linkPreview:
 *                 type: boolean
 *                 default: true
 *                 description: Genera preview si el texto contiene una URL
 *               quoted:
 *                 $ref: '#/components/schemas/QuotedMessage'
 *           examples:
 *             texto_simple:
 *               summary: Texto sin opciones
 *               value:
 *                 number: "5215512345678"
 *                 text: "Hola! ¿Cómo estás?"
 *             con_delay:
 *               summary: Con efecto de escritura
 *               value:
 *                 number: "5215512345678"
 *                 text: "Gracias por contactarnos, en breve te atendemos."
 *                 delay: 1500
 *             reply_a_mensaje:
 *               summary: Respondiendo a un mensaje previo
 *               value:
 *                 number: "5215512345678"
 *                 text: "Claro, con gusto te ayudo con eso."
 *                 delay: 800
 *                 quoted:
 *                   key:
 *                     id: "BAE594145F4C59B4"
 *                   message:
 *                     conversation: "Necesito ayuda con mi pedido"
 *     responses:
 *       200:
 *         description: Mensaje enviado exitosamente
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
 *                   example: Mensaje de texto enviado exitosamente
 *                 data:
 *                   $ref: '#/components/schemas/MessageResponse'
 *             example:
 *               success: true
 *               message: Mensaje de texto enviado exitosamente
 *               data:
 *                 key:
 *                   remoteJid: "5215512345678@s.whatsapp.net"
 *                   fromMe: true
 *                   id: "BAE594145F4C59B4"
 *                 messageTimestamp: "1717689097"
 *                 status: PENDING
 *       400:
 *         description: Número inválido o sin WhatsApp
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error:
 *                 code: SEND_REJECTED
 *                 message: "Envío rechazado: number is not whatsapp"
 *       404:
 *         description: Instancia no encontrada
 *       422:
 *         description: Validación fallida (body inválido)
 */
router.post(
  '/text',
  validateRequest(sendTextSchema),
  asyncHandler(messageController.sendText)
);

// ============================================================
// POST /media — Imagen, video, documento
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/messages/media:
 *   post:
 *     summary: Enviar archivo multimedia (imagen, video, documento)
 *     description: |
 *       Envía archivos adjuntos de distintos tipos.
 *
 *       **Tipos y comportamiento en WhatsApp:**
 *       - `image` → Muestra preview inline. Formatos: JPG, PNG, WEBP, GIF
 *       - `video` → Muestra reproductor inline. Formatos: MP4, AVI, MOV
 *       - `document` → Descargable con ícono. Formatos: PDF, DOCX, XLSX, ZIP, etc.
 *       - `audio` → Archivo de audio descargable (NO nota de voz, usa /audio para eso)
 *
 *       **Fuentes del archivo:**
 *       - URL pública: `"https://ejemplo.com/imagen.jpg"` (recomendado)
 *       - Base64: `"data:image/jpeg;base64,/9j/4AAQ..."` (para archivos locales)
 *
 *       **Ejemplo — enviar PDF:**
 *       ```bash
 *       curl -X POST .../messages/media \
 *         -d '{"number":"5215512345678","mediatype":"document","media":"https://ejemplo.com/doc.pdf","fileName":"cotizacion.pdf","caption":"Aquí tu cotización 📄"}'
 *       ```
 *     tags: [Mensajes]
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
 *               - number
 *               - mediatype
 *               - media
 *             properties:
 *               number:
 *                 type: string
 *                 example: "5215512345678"
 *               mediatype:
 *                 type: string
 *                 enum: [image, video, document, audio]
 *                 example: image
 *               media:
 *                 type: string
 *                 example: "https://ejemplo.com/imagen.jpg"
 *                 description: URL pública HTTPS o string base64 del archivo
 *               caption:
 *                 type: string
 *                 example: "Mira esta imagen 👀"
 *                 description: Texto descriptivo (solo para image y video, máx 1024 chars)
 *               fileName:
 *                 type: string
 *                 example: "cotizacion_marzo.pdf"
 *                 description: Nombre del archivo (recomendado para document)
 *               delay:
 *                 type: integer
 *                 example: 500
 *           examples:
 *             enviar_imagen:
 *               summary: Imagen con caption
 *               value:
 *                 number: "5215512345678"
 *                 mediatype: image
 *                 media: "https://picsum.photos/800/600"
 *                 caption: "Tu comprobante de pago ✅"
 *             enviar_pdf:
 *               summary: Documento PDF
 *               value:
 *                 number: "5215512345678"
 *                 mediatype: document
 *                 media: "https://ejemplo.com/factura.pdf"
 *                 fileName: "factura_001.pdf"
 *                 caption: "Factura del mes de Marzo"
 *             enviar_video:
 *               summary: Video MP4
 *               value:
 *                 number: "5215512345678"
 *                 mediatype: video
 *                 media: "https://ejemplo.com/tutorial.mp4"
 *                 caption: "Tutorial de instalación 🎬"
 *     responses:
 *       200:
 *         description: Archivo enviado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Formato de archivo inválido o número sin WhatsApp
 *       404:
 *         description: Instancia no encontrada
 *       422:
 *         description: Validación fallida
 */
router.post(
  '/media',
  validateRequest(sendMediaSchema),
  asyncHandler(messageController.sendMedia)
);

// ============================================================
// POST /audio — Nota de voz
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/messages/audio:
 *   post:
 *     summary: Enviar nota de voz (PTT)
 *     description: |
 *       Envía un mensaje de audio que aparece como **nota de voz** en WhatsApp,
 *       con la forma de onda característica y el ícono de auricular.
 *
 *       **Diferencia clave vs `POST /media` tipo audio:**
 *       - `/media` con `audiotype: audio` → aparece como archivo descargable
 *       - `/audio` → aparece como nota de voz PTT (Push To Talk) con forma de onda
 *
 *       **Formatos soportados:** MP3, OGG, M4A, WAV
 *       Evolution API convierte internamente a OGG opus (formato nativo de WhatsApp).
 *
 *       **Caso de uso:** Respuestas automatizadas más humanas, atención al cliente.
 *     tags: [Mensajes]
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
 *               - number
 *               - audio
 *             properties:
 *               number:
 *                 type: string
 *                 example: "5215512345678"
 *               audio:
 *                 type: string
 *                 example: "https://ejemplo.com/respuesta.mp3"
 *                 description: URL pública del audio o base64
 *               delay:
 *                 type: integer
 *                 example: 500
 *                 description: ms antes de enviar
 *           examples:
 *             nota_de_voz_url:
 *               summary: Nota de voz desde URL
 *               value:
 *                 number: "5215512345678"
 *                 audio: "https://ejemplo.com/bienvenida.mp3"
 *                 delay: 500
 *     responses:
 *       200:
 *         description: Nota de voz enviada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Formato de audio inválido
 *       404:
 *         description: Instancia no encontrada
 */
router.post(
  '/audio',
  validateRequest(sendAudioSchema),
  asyncHandler(messageController.sendAudio)
);

// ============================================================
// POST /location — Ubicación geográfica
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/messages/location:
 *   post:
 *     summary: Enviar ubicación geográfica
 *     description: |
 *       Envía una ubicación que aparece como **tarjeta de mapa interactivo**
 *       en WhatsApp. El receptor puede tocarla para abrirla en Google Maps.
 *
 *       **Casos de uso:**
 *       - Compartir dirección de tu negocio automáticamente
 *       - Confirmar punto de entrega en e-commerce
 *       - Atención al cliente con sucursal más cercana
 *
 *       **Ejemplo — Ciudad de México:**
 *       ```json
 *       { "number": "5215512345678", "latitude": 19.4326, "longitude": -99.1332, "name": "Ciudad de México" }
 *       ```
 *     tags: [Mensajes]
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
 *               - number
 *               - latitude
 *               - longitude
 *             properties:
 *               number:
 *                 type: string
 *                 example: "5215512345678"
 *               latitude:
 *                 type: number
 *                 example: 19.4326
 *                 description: Latitud entre -90 y 90
 *               longitude:
 *                 type: number
 *                 example: -99.1332
 *                 description: Longitud entre -180 y 180
 *               name:
 *                 type: string
 *                 example: "Oficinas ChatFast"
 *                 description: Nombre del lugar (aparece como título en la tarjeta)
 *               address:
 *                 type: string
 *                 example: "Av. Reforma 222, CDMX"
 *                 description: Dirección completa (aparece como subtítulo)
 *           examples:
 *             negocio:
 *               summary: Ubicación de un negocio
 *               value:
 *                 number: "5215512345678"
 *                 latitude: 19.4326
 *                 longitude: -99.1332
 *                 name: "Oficinas ChatFast"
 *                 address: "Av. Reforma 222, Col. Juárez, CDMX"
 *     responses:
 *       200:
 *         description: Ubicación enviada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/MessageResponse'
 *       404:
 *         description: Instancia no encontrada
 */
router.post(
  '/location',
  validateRequest(sendLocationSchema),
  asyncHandler(messageController.sendLocation)
);

// ============================================================
// POST /reaction — Reacción emoji a un mensaje
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/messages/reaction:
 *   post:
 *     summary: Reaccionar a un mensaje con emoji
 *     description: |
 *       Agrega o elimina una reacción emoji a un mensaje previo.
 *
 *       **Para agregar:** envía cualquier emoji en `reaction`
 *       **Para eliminar:** envía `reaction: ""`
 *
 *       **Obtener el `key.id`:**
 *       Cuando llega un mensaje al webhook (`MESSAGES_UPSERT`), el body incluye
 *       `data.key.id` — ese es el ID que necesitas aquí.
 *
 *       **Ejemplo de flujo:**
 *       1. Llega mensaje via webhook → `data.key.id = "BAE594145F4C59B4"`
 *       2. Hacer POST a /reaction con ese ID y `reaction: "❤️"`
 *       3. El remitente ve la reacción en su mensaje
 *     tags: [Mensajes]
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
 *               - key
 *               - reaction
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
 *                     example: false
 *                     description: false si el mensaje lo envió el contacto
 *                   id:
 *                     type: string
 *                     example: "BAE594145F4C59B4"
 *                     description: ID del mensaje a reaccionar (del webhook MESSAGES_UPSERT)
 *               reaction:
 *                 type: string
 *                 example: "❤️"
 *                 description: Emoji de reacción. Enviar "" para eliminar la reacción.
 *           examples:
 *             agregar_reaccion:
 *               summary: Reaccionar con corazón
 *               value:
 *                 key:
 *                   remoteJid: "5215512345678@s.whatsapp.net"
 *                   fromMe: false
 *                   id: "BAE594145F4C59B4"
 *                 reaction: "❤️"
 *             eliminar_reaccion:
 *               summary: Eliminar reacción
 *               value:
 *                 key:
 *                   remoteJid: "5215512345678@s.whatsapp.net"
 *                   fromMe: false
 *                   id: "BAE594145F4C59B4"
 *                 reaction: ""
 *     responses:
 *       200:
 *         description: Reacción enviada/eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/MessageResponse'
 *       404:
 *         description: Instancia no encontrada
 */
router.post(
  '/reaction',
  validateRequest(sendReactionSchema),
  asyncHandler(messageController.sendReaction)
);

// ============================================================
// POST /poll — Encuesta (reemplazo gratuito de botones)
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/messages/poll:
 *   post:
 *     summary: Enviar encuesta interactiva (Poll)
 *     description: |
 *       Crea una encuesta nativa de WhatsApp. Es el **reemplazo gratuito** de los
 *       botones interactivos que Meta restringió a plantillas de pago.
 *
 *       **Cómo funciona el flujo bot:**
 *       1. Envías la encuesta con las opciones de tu menú
 *       2. El usuario toca una opción (vota)
 *       3. Evolution API dispara webhook `MESSAGES_UPSERT` con `pollUpdateMessage`
 *       4. Tu backend lee la opción elegida y responde automáticamente
 *
 *       **Límites de WhatsApp:**
 *       - Mínimo 2 opciones, máximo 12
 *       - `selectableCount: 1` → selección única (tipo radio button)
 *       - `selectableCount: 2+` → selección múltiple (tipo checkbox)
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID de la instancia conectada
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - number
 *               - name
 *               - values
 *             properties:
 *               number:
 *                 type: string
 *                 example: "5215512345678"
 *                 description: Número destino con código de país
 *               name:
 *                 type: string
 *                 example: "¿Qué necesitas hoy?"
 *                 description: Pregunta principal de la encuesta (máx 255 chars)
 *               values:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Ver catálogo", "Estado de mi pedido", "Hablar con un asesor", "Otro"]
 *                 description: Opciones de respuesta (mínimo 2, máximo 12)
 *               selectableCount:
 *                 type: integer
 *                 default: 1
 *                 example: 1
 *                 description: Cuántas opciones puede seleccionar el usuario. 1 = única, >1 = múltiple
 *               delay:
 *                 type: integer
 *                 example: 1000
 *                 description: ms de delay antes de enviar
 *           examples:
 *             menu_principal:
 *               summary: Menú de bienvenida bot
 *               value:
 *                 number: "5215512345678"
 *                 name: "¡Hola! ¿En qué te puedo ayudar hoy? 👋"
 *                 values:
 *                   - "🛍️ Ver catálogo"
 *                   - "📦 Estado de mi pedido"
 *                   - "💬 Hablar con un asesor"
 *                   - "❓ Otra consulta"
 *                 selectableCount: 1
 *                 delay: 1000
 *             encuesta_satisfaccion:
 *               summary: Encuesta de satisfacción post-venta
 *               value:
 *                 number: "5215512345678"
 *                 name: "¿Cómo calificarías tu experiencia de compra?"
 *                 values:
 *                   - "⭐ Mala"
 *                   - "⭐⭐ Regular"
 *                   - "⭐⭐⭐ Buena"
 *                   - "⭐⭐⭐⭐ Muy buena"
 *                   - "⭐⭐⭐⭐⭐ Excelente"
 *                 selectableCount: 1
 *     responses:
 *       200:
 *         description: Encuesta enviada exitosamente
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
 *                   example: Encuesta enviada exitosamente
 *                 data:
 *                   $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Datos inválidos (menos de 2 opciones, pregunta vacía, etc.)
 *       404:
 *         description: Instancia no encontrada
 */
router.post(
  '/poll',
  validateRequest(sendPollSchema),
  asyncHandler(messageController.sendPoll)
);

// ============================================================
// POST /contact — Tarjeta de contacto (vCard)
// ============================================================

/**
 * @swagger
 * /api/v1/instances/{instanceId}/messages/contact:
 *   post:
 *     summary: Enviar tarjeta de contacto (vCard)
 *     description: |
 *       Envía una o varias tarjetas de contacto que el receptor puede guardar
 *       con un **solo tap** en WhatsApp.
 *
 *       **Por qué usar esto en ventas:**
 *       En lugar de escribir "Guarda mi número: +52155...", envías la tarjeta
 *       directamente. La tasa de conversión sube porque el usuario no tiene que
 *       teclear el número manualmente — solo toca "Guardar contacto".
 *
 *       **Casos de uso:**
 *       - Enviar tarjeta del asesor asignado al cliente
 *       - Compartir contacto de soporte técnico
 *       - Cierre de ventas: "Guarda mi número para futuras compras"
 *
 *       **Nota:** Si no incluyes `phoneNumber`, Evolution lo construye
 *       automáticamente desde el campo `wuid`.
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID de la instancia conectada
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - number
 *               - contact
 *             properties:
 *               number:
 *                 type: string
 *                 example: "5215512345678"
 *                 description: Número destino con código de país
 *               contact:
 *                 type: array
 *                 description: Lista de contactos a enviar (máx 5)
 *                 items:
 *                   type: object
 *                   required:
 *                     - fullName
 *                     - wuid
 *                   properties:
 *                     fullName:
 *                       type: string
 *                       example: "Kelvis Escudero"
 *                       description: Nombre completo que aparecerá en la vCard
 *                     wuid:
 *                       type: string
 *                       example: "5215512345678"
 *                       description: Número WhatsApp del contacto SIN + ni @s.whatsapp.net
 *                     phoneNumber:
 *                       type: object
 *                       description: Opcional. Si se omite, Evolution lo construye desde wuid.
 *                       properties:
 *                         wuid:
 *                           type: string
 *                           example: "5215512345678"
 *                         number:
 *                           type: string
 *                           example: "+5215512345678"
 *                           description: Con + para formato internacional en la vCard
 *               delay:
 *                 type: integer
 *                 example: 500
 *           examples:
 *             contacto_simple:
 *               summary: Enviar tarjeta del asesor
 *               value:
 *                 number: "5215512345678"
 *                 contact:
 *                   - fullName: "Kelvis Escudero - ChatFast"
 *                     wuid: "5215509876543"
 *                 delay: 500
 *             contacto_completo:
 *               summary: Con phoneNumber explícito
 *               value:
 *                 number: "5215512345678"
 *                 contact:
 *                   - fullName: "Soporte ChatFast"
 *                     wuid: "5215509876543"
 *                     phoneNumber:
 *                       wuid: "5215509876543"
 *                       number: "+5215509876543"
 *             multi_contacto:
 *               summary: Enviar múltiples tarjetas
 *               value:
 *                 number: "5215512345678"
 *                 contact:
 *                   - fullName: "Ventas - Kelvis Tech"
 *                     wuid: "5215509876541"
 *                   - fullName: "Soporte - Kelvis Tech"
 *                     wuid: "5215509876542"
 *     responses:
 *       200:
 *         description: Tarjeta de contacto enviada exitosamente
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
 *                   example: Tarjeta de contacto enviada exitosamente
 *                 data:
 *                   $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Instancia no encontrada
 */
router.post(
  '/contact',
  validateRequest(sendContactSchema),
  asyncHandler(messageController.sendContact)
);

export default router;