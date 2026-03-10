import axios, { AxiosInstance } from 'axios';
import { evolutionApi } from '../config/evolution';
import instanceRepository from '../repositories/instances.repository';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';
import { TtlCache } from '../utils/TtlCache';
import type { SendPresenceDto, MarkReadDto } from '../validators/message.validator';

// ============================================================
// TIPOS DE RESPUESTA — Evolution API v2
// ============================================================

interface PresenceResponse {
  presence: string;
  delay: number;
}

interface MarkReadResponse {
  read: boolean;
}

interface ProfilePictureResponse {
  wuid: string;
  profilePictureUrl: string | null;
}

interface InstanceRecord {
  id: string;
  name: string;
  status: string;
}

// ============================================================
// CONSTANTES
// ============================================================

const CONNECTED_STATES       = new Set(['CONNECTED', 'open']);
const EVOLUTION_TIMEOUT_MS   = 10_000;
const MAX_RETRIES            = 2;
const RETRY_BASE_DELAY_MS    = 300;
const PROFILE_PICTURE_TTL_MS = 15 * 60 * 1_000;

// Códigos HTTP que NO se reintentan — errores del cliente, no del servidor
// NOTA: 500 NO está aquí porque Evolution lo usa para "sin foto de perfil",
// lo cual es transitorio y se maneja especialmente en getProfilePicture.
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 422]);

// ============================================================
// NORMALIZACIÓN DE NÚMEROS DE WHATSAPP
//
// Evolution API v2 es INCONSISTENTE con el formato de número.
// Verificado empíricamente con Evolution v2.2.x:
//
//   Endpoint                         | Formato requerido | Función
//   ---------------------------------|-------------------|----------
//   /chat/sendPresence               | Solo dígitos      | toDigits()
//   /chat/markMessageAsRead          | JID completo      | toJid()
//   /chat/fetchProfilePictureUrl     | Solo dígitos      | toDigits()
//   /message/sendText                | JID completo      | toJid()
//   /message/sendMedia               | JID completo      | toJid()
// ============================================================

/** Elimina @s.whatsapp.net y @g.us → solo dígitos */
function toDigits(number: string): string {
  return number
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@g\.us$/, '')
    .trim();
}

/** Garantiza que el número tenga sufijo JID correcto */
function toJid(number: string): string {
  if (number.endsWith('@s.whatsapp.net') || number.endsWith('@g.us')) return number;
  return `${number}@s.whatsapp.net`;
}

// ============================================================
// EXTRACTOR DE MENSAJES DE ERROR — Evolution API v2
//
// Evolution devuelve errores en al menos 4 formatos distintos.
// Esta función los normaliza todos a un string legible.
// ============================================================

function extractEvolutionMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return String(error);
  const data = error.response?.data;
  if (!data) return error.message;

  // Formato 1: { response: { message: ["texto"] } }
  if (data?.response?.message) {
    return Array.isArray(data.response.message)
      ? data.response.message.join(', ')
      : String(data.response.message);
  }
  // Formato 2: { message: "texto" }
  if (typeof data?.message === 'string') return data.message;
  // Formato 3: { error: "texto" }
  if (typeof data?.error === 'string') return data.error;
  // Formato 4: objeto no reconocido
  return JSON.stringify(data);
}

// ============================================================
// CONVERSOR DE ERRORES A APPERROR
//
// SIEMPRE devuelve un AppError tipado — nunca deja pasar
// un axios error crudo al errorHandler global (causaría 500).
// ============================================================

function toAppError(error: unknown, context: string): AppError {
  if (error instanceof AppError) return error;

  if (axios.isAxiosError(error)) {
    const status  = error.response?.status ?? 0;
    const message = extractEvolutionMessage(error);

    logger.error(`[ChatService] Evolution API error in "${context}"`, {
      status,
      url:               error.config?.url,
      method:            error.config?.method?.toUpperCase(),
      evolutionResponse: error.response?.data,
      isTimeout:         error.code === 'ECONNABORTED',
    });

    if (status === 400) return new AppError('VALIDATION_ERROR',  `Evolution rechazó los datos: ${message}`, 400);
    if (status === 401) return new AppError('UNAUTHORIZED',      'API Key de Evolution inválida o expirada', 401);
    if (status === 403) return new AppError('FORBIDDEN',         'Sin permisos para esta operación en Evolution', 403);
    if (status === 404) return new AppError('NOT_FOUND',         `Recurso no encontrado en Evolution: ${message}`, 404);
    if (status === 429) return new AppError('RATE_LIMITED',      'Evolution API: límite de solicitudes alcanzado. Intenta en unos segundos.', 429);
    if (error.code === 'ECONNABORTED') {
      return new AppError('EVOLUTION_API_ERROR', `Evolution API no respondió en ${EVOLUTION_TIMEOUT_MS / 1000}s`, 504);
    }
    // 5xx → 502 Bad Gateway desde nuestro lado
    return new AppError('EVOLUTION_API_ERROR', `Evolution API falló (${status}): ${message}`, 502);
  }

  logger.error(`[ChatService] Unexpected error in "${context}"`, { error });
  return new AppError('INTERNAL_ERROR', `Error interno en ${context}`, 500, false);
}

// ============================================================
// RETRY CON BACKOFF EXPONENCIAL
//
// Reintenta solo errores transitorios (5xx, timeouts).
// Errores del cliente (4xx) fallan inmediatamente convertidos a AppError.
//
// Flujo de ejemplo:
//   intento 1: 404 → NON_RETRYABLE → toAppError() → AppError(404) ← throw
//   intento 1: 503 → reintentable → esperar 300ms
//   intento 2: 503 → reintentable → esperar 600ms
//   intento 3: 503 → agotado → toAppError() → AppError(502) ← throw
// ============================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // AppError 4xx ya tipado → propagar sin reintentar
      if (error instanceof AppError && error.statusCode < 500) throw error;

      // Axios 4xx → convertir a AppError ANTES de throw (bug fix crítico)
      if (axios.isAxiosError(error) && NON_RETRYABLE_STATUS.has(error.response?.status ?? 0)) {
        throw toAppError(error, context);
      }

      if (attempt <= maxRetries) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`[ChatService] Retrying "${context}" (attempt ${attempt}/${maxRetries}) in ${delayMs}ms`, {
          reason: axios.isAxiosError(error) ? `HTTP ${error.response?.status}` : String(error),
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw toAppError(lastError, context);
}

// ============================================================
// GUARD: Verificar que la instancia existe Y está conectada
//
// Falla rápido con mensaje claro antes de llamar a Evolution.
// ============================================================

async function getConnectedInstance(instanceId: string): Promise<InstanceRecord> {
  const instance = await instanceRepository.findById(instanceId);

  if (!instance) {
    throw new AppError('NOT_FOUND', `Instancia con id "${instanceId}" no encontrada`, 404);
  }

  if (!CONNECTED_STATES.has(instance.status)) {
    throw new AppError(
      'INSTANCE_DISCONNECTED',
      `La instancia "${instance.name}" no está conectada (estado: ${instance.status}). ` +
      `Reconéctala desde el panel o escanea el QR nuevamente.`,
      409
    );
  }

  return instance;
}

// ============================================================
// HELPER: Cliente axios con timeout garantizado
// Previene que una llamada colgada bloquee el event loop.
// ============================================================

function getEvolutionClient(): AxiosInstance {
  const client = evolutionApi.getInstance();
  client.defaults.timeout = client.defaults.timeout ?? EVOLUTION_TIMEOUT_MS;
  return client;
}

// ============================================================
// CACHES
// ============================================================

const profilePictureCache = new TtlCache<ProfilePictureResponse>(PROFILE_PICTURE_TTL_MS);

// ============================================================
// CHAT SERVICE
// ============================================================

class ChatService {

  // ----------------------------------------------------------
  // sendPresence
  // Muestra "Escribiendo..." o "Grabando audio..." al destinatario.
  // Formato número: solo dígitos (verificado con Evolution v2)
  // ----------------------------------------------------------
  async sendPresence(instanceId: string, data: SendPresenceDto): Promise<PresenceResponse> {
    const instance = await getConnectedInstance(instanceId);
    const number   = toDigits(data.number);
    const delay    = data.delay ?? 1_000;

    const result = await withRetry(async () => {
      const response = await getEvolutionClient().post<PresenceResponse>(
        `/chat/sendPresence/${instance.name}`,
        { number, presence: data.presence, delay }
      );
      return response.data;
    }, 'sendPresence');

    logger.info('[ChatService] Presence sent', {
      instanceName: instance.name,
      to:           number,
      presence:     data.presence,
      durationMs:   delay,
    });

    return result;
  }

  // ----------------------------------------------------------
  // markAsRead
  // Fuerza el doble check azul en mensajes específicos.
  // Formato número: JID completo (verificado — toDigits causaba 200 sin efecto)
  // ----------------------------------------------------------
  async markAsRead(instanceId: string, data: MarkReadDto): Promise<MarkReadResponse> {
    const instance = await getConnectedInstance(instanceId);

    // toJid() garantiza @s.whatsapp.net o @g.us
    // Evolution necesita el JID completo para localizar el chat internamente
    const readMessages = data.readMessages.map((msg) => ({
      ...msg,
      remoteJid: toJid(msg.remoteJid),
    }));

    const result = await withRetry(async () => {
      const response = await getEvolutionClient().post<MarkReadResponse>(
        `/chat/markMessageAsRead/${instance.name}`,
        { readMessages }
      );
      return response.data;
    }, 'markAsRead');

    logger.info('[ChatService] Messages marked as read', {
      instanceName: instance.name,
      count:        readMessages.length,
      ids:          readMessages.map((m) => m.id),
    });

    return result;
  }

  // ----------------------------------------------------------
  // getProfilePicture
  //
  // COMPORTAMIENTO REAL DE EVOLUTION v2 (verificado):
  //   - Tiene foto       → POST 200 con profilePictureUrl
  //   - Sin foto / bloqueó / no en WhatsApp → POST 500
  //     (Evolution usa 500 para esto, no 404)
  //
  // BUG ANTERIOR: usábamos GET con query params → Evolution ignoraba.
  // FIX: POST con number en el body.
  //
  // BUG ANTERIOR: el catch chequeaba axios.isAxiosError() pero withRetry
  // ya convierte los 500 a AppError(502) antes de llegar al catch.
  // FIX: chequeamos AppError con code EVOLUTION_API_ERROR y statusCode 502.
  //
  // Estrategia de caché:
  //   HIT  → respuesta desde memoria (~0ms)
  //   MISS → POST a Evolution → cachear si tiene foto
  //   null → NO cachear (puede subir foto pronto)
  // ----------------------------------------------------------
  async getProfilePicture(instanceId: string, number: string): Promise<ProfilePictureResponse> {
    const instance    = await getConnectedInstance(instanceId);
    const cleanNumber = toDigits(number);
    const cacheKey    = `${instanceId}:${cleanNumber}`;

    const cached = profilePictureCache.get(cacheKey);
    if (cached) {
      logger.debug('[ChatService] Profile picture cache hit', {
        number:    cleanNumber,
        cacheSize: profilePictureCache.size,
      });
      return cached;
    }

    let result: ProfilePictureResponse;

    try {
      // POST con number en el body (no GET — verificado con Evolution v2)
      result = await withRetry(async () => {
        const response = await getEvolutionClient().post<ProfilePictureResponse>(
          `/chat/fetchProfilePictureUrl/${instance.name}`,
          { number: cleanNumber }
        );
        return response.data;
      }, 'getProfilePicture');

    } catch (error) {
      // Evolution devuelve 500 cuando el contacto no tiene foto o la bloqueó.
      // withRetry convierte ese 500 en AppError('EVOLUTION_API_ERROR', 502).
      // Lo capturamos aquí para devolver null graciosamente en lugar de error.
      const isEvolutionNoPhoto =
        error instanceof AppError &&
        error.code === 'EVOLUTION_API_ERROR' &&
        error.statusCode === 502;

      if (isEvolutionNoPhoto) {
        logger.info('[ChatService] Contact has no profile picture (Evolution 500→502)', {
          instanceName: instance.name,
          number:       cleanNumber,
        });
        // NO cacheamos null — el contacto puede subir foto pronto
        return { wuid: `${cleanNumber}@s.whatsapp.net`, profilePictureUrl: null };
      }

      // Cualquier otro error (auth, instancia caída, etc.) → propagar
      throw error;
    }

    if (result.profilePictureUrl) {
      profilePictureCache.set(cacheKey, result);
    }

    logger.info('[ChatService] Profile picture fetched', {
      instanceName: instance.name,
      number:       cleanNumber,
      hasPhoto:     !!result.profilePictureUrl,
      cacheSize:    profilePictureCache.size,
    });

    return result;
  }

  // ----------------------------------------------------------
  // invalidateProfileCache
  // Fuerza recarga de foto. Úsalo en webhook CONTACTS_UPDATE.
  // ----------------------------------------------------------
  invalidateProfileCache(instanceId: string, number: string): void {
    const cacheKey = `${instanceId}:${toDigits(number)}`;
    profilePictureCache.delete(cacheKey);
    logger.debug('[ChatService] Profile picture cache invalidated', {
      number: toDigits(number),
    });
  }

  // ----------------------------------------------------------
  // getCacheStats — Exponer métricas para /health endpoint
  // ----------------------------------------------------------
  getCacheStats(): { profilePictureCacheSize: number } {
    return {
      profilePictureCacheSize: profilePictureCache.size,
    };
  }
}

export const chatService = new ChatService();
export default chatService;