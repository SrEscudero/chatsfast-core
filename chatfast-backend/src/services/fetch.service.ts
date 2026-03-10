import axios, { AxiosInstance } from 'axios';
import { evolutionApi } from '../config/evolution';
import instanceRepository from '../repositories/instances.repository';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';

// ============================================================
// TIPOS DE RESPUESTA — Evolution API v2 Fetch
// ============================================================

interface Contact {
  id:        string;   // JID: "5215512345678@s.whatsapp.net"
  name?:     string;   // Nombre guardado en el teléfono
  pushname?: string;   // Nombre visible en WhatsApp
}

interface Chat {
  id:              string;    // JID del chat
  name?:           string;
  unreadCount?:    number;
  lastMessage?:    Record<string, unknown>;
  lastMessageTime?: number;
}

interface FetchedMessage {
  key: {
    remoteJid: string;
    fromMe:    boolean;
    id:        string;
  };
  message?:          Record<string, unknown>;
  messageTimestamp?: number;
  pushName?:         string;
  status?:           string;
}

// ============================================================
// CONSTANTES
// ============================================================

const CONNECTED_STATES     = new Set(['CONNECTED', 'open']);
const EVOLUTION_TIMEOUT_MS = 15_000; // Fetch puede tardar más — damos 15s
const MAX_RETRIES          = 2;
const RETRY_BASE_DELAY_MS  = 500;    // Más conservador para operaciones de sincronización
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 422]);

// ============================================================
// ERROR HANDLING
// ============================================================

function extractEvolutionMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return String(error);
  const data = error.response?.data;
  if (!data) return (error as any).message;
  if (data?.response?.message) {
    return Array.isArray(data.response.message)
      ? data.response.message.join(', ')
      : String(data.response.message);
  }
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error   === 'string') return data.error;
  return JSON.stringify(data);
}

function toAppError(error: unknown, context: string): AppError {
  if (error instanceof AppError) return error;
  if (axios.isAxiosError(error)) {
    const status  = error.response?.status ?? 0;
    const message = extractEvolutionMessage(error);
    logger.error(`[FetchService] Evolution error in "${context}"`, {
      status, url: error.config?.url, evolutionResponse: error.response?.data,
    });
    if (status === 400) return new AppError('VALIDATION_ERROR',  `Evolution rechazó los datos: ${message}`, 400);
    if (status === 401) return new AppError('UNAUTHORIZED',      'API Key de Evolution inválida', 401);
    if (status === 403) return new AppError('FORBIDDEN',         'Sin permisos para esta operación', 403);
    if (status === 404) return new AppError('NOT_FOUND',         `No encontrado: ${message}`, 404);
    if (status === 429) return new AppError('RATE_LIMITED',      'Demasiadas solicitudes. Intenta más tarde.', 429);
    if ((error as any).code === 'ECONNABORTED') {
      return new AppError('EVOLUTION_API_ERROR', `Evolution no respondió en ${EVOLUTION_TIMEOUT_MS / 1000}s`, 504);
    }
    return new AppError('EVOLUTION_API_ERROR', `Evolution falló (${status}): ${message}`, 502);
  }
  logger.error(`[FetchService] Unexpected error in "${context}"`, { error });
  return new AppError('INTERNAL_ERROR', `Error interno en ${context}`, 500, false);
}

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof AppError && error.statusCode < 500) throw error;
      if (axios.isAxiosError(error) && NON_RETRYABLE_STATUS.has(error.response?.status ?? 0)) {
        throw toAppError(error, context);
      }
      if (attempt <= MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`[FetchService] Retrying "${context}" (${attempt}/${MAX_RETRIES}) in ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw toAppError(lastError, context);
}

async function getConnectedInstance(instanceId: string) {
  const instance = await instanceRepository.findById(instanceId);
  if (!instance) throw new AppError('NOT_FOUND', `Instancia "${instanceId}" no encontrada`, 404);
  // Nota: no bloqueamos por estado en DB porque el estado puede estar
  // desactualizado (webhook de connection.update perdido o retrasado).
  // Evolution API rechazará la llamada si de verdad no está conectada.
  if (!CONNECTED_STATES.has(instance.status)) {
    logger.warn(
      `[FetchService] Instancia "${instance.name}" tiene estado ${instance.status} en DB, ` +
      `intentando de todas formas — Evolution API confirmará si está activa.`
    );
  }
  return instance;
}

function getEvolutionClient(): AxiosInstance {
  const client = evolutionApi.getInstance();
  client.defaults.timeout = client.defaults.timeout ?? EVOLUTION_TIMEOUT_MS;
  return client;
}

// ============================================================
// NORMALIZACIÓN DE RESPUESTAS PAGINADAS
//
// Evolution API v2 devuelve los datos en formatos inconsistentes
// dependiendo del endpoint y versión:
//
//   Formato A — Array plano (algunos endpoints):
//     [ { id, key, ... }, ... ]
//
//   Formato B — Objeto paginado (findMessages, findChats):
//     { messages: { total, pages, currentPage, records: [...] } }
//     { chats:    { total, pages, currentPage, records: [...] } }
//
//   Formato C — Objeto con records directo:
//     { records: [...], total: N }
//
// normalizeRecords() detecta el formato y siempre retorna un array.
// ============================================================

function normalizeRecords<T>(raw: any): T[] {
  if (!raw) return [];

  // Formato A: ya es un array plano
  if (Array.isArray(raw)) return raw as T[];

  // Formato C: { records: [...] } directo en la raíz
  if (Array.isArray(raw.records)) return raw.records as T[];

  // Formato B/D: objeto con una clave cuyo valor puede ser:
  //   B) { chats: { records: [...] } }  — paginado
  //   D) { chats: [...] }               — array directo (más común en Evolution v2)
  const keys = Object.keys(raw).filter(k => k !== 'cursor' && k !== 'total' && k !== 'pages' && k !== 'currentPage');
  for (const key of keys) {
    const val = raw[key];
    if (!val) continue;
    // Formato B: objeto con .records
    if (typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.records)) {
      logger.debug(`[FetchService] normalizeRecords: formato B (${key}.records)`);
      return val.records as T[];
    }
    // Formato D: array directo
    if (Array.isArray(val) && val.length >= 0) {
      logger.debug(`[FetchService] normalizeRecords: formato D (${key} = array, len=${val.length})`);
      return val as T[];
    }
  }

  logger.warn('[FetchService] normalizeRecords: formato no reconocido', {
    keys: Object.keys(raw),
    sample: JSON.stringify(raw).slice(0, 200),
  });
  return [];
}

// ============================================================
// FETCH SERVICE
// ============================================================

class FetchService {

  // ----------------------------------------------------------
  // fetchContacts
  // GET /chat/findContacts/{instanceName}
  //
  // Descarga toda la agenda del teléfono conectado.
  // Útil para mostrar los contactos en el CRM antes de que
  // el usuario empiece a recibir mensajes.
  //
  // NOTA: Puede ser una lista larga. Considerar paginación
  // en el frontend si el cliente tiene >500 contactos.
  // ----------------------------------------------------------
  async fetchContacts(instanceId: string): Promise<Contact[]> {
    const instance = await getConnectedInstance(instanceId);

    const raw = await withRetry(async () => {
      // Evolution API v2 usa POST para todas las operaciones /chat/find*
      // GET devuelve 404 — verificado en producción
      // skip:0 + limit:5000 para traer toda la agenda sin paginación
      const res = await getEvolutionClient().post(
        `/chat/findContacts/${instance.name}`,
        { skip: 0, limit: 5000 }
      );
      return res.data;
    }, 'fetchContacts');

    // Evolution puede devolver array plano o { contacts: { records: [...] } }
    const records: Contact[] = normalizeRecords(raw);

    logger.info('[FetchService] Contacts fetched', {
      instanceName: instance.name,
      count: records.length,
    });
    return records;
  }

  // ----------------------------------------------------------
  // fetchChats
  // POST /chat/findChats/{instanceName}
  //
  // Trae la lista de conversaciones abiertas (como la pantalla
  // principal de WhatsApp). Incluye nombre, último mensaje y
  // cantidad de mensajes no leídos.
  // ----------------------------------------------------------
  async fetchChats(instanceId: string): Promise<Chat[]> {
    const instance = await getConnectedInstance(instanceId);

    const raw = await withRetry(async () => {
      // skip:0 + limit:1000 para traer todos los chats sin paginación.
      // Sin limit, Evolution API devuelve solo la primera página (~20-50 chats).
      const res = await getEvolutionClient().post(
        `/chat/findChats/${instance.name}`,
        { skip: 0, limit: 1000 }
      );
      return res.data;
    }, 'fetchChats');

    // Log del formato real para diagnóstico
    logger.debug('[FetchService] fetchChats raw response shape', {
      isArray: Array.isArray(raw),
      keys: raw && typeof raw === 'object' ? Object.keys(raw) : [],
      sample: JSON.stringify(raw).slice(0, 300),
    });

    // Evolution puede devolver array plano o { chats: { records: [...] } } o { chats: [...] }
    const records: Chat[] = normalizeRecords(raw);

    logger.info('[FetchService] Chats fetched', {
      instanceName: instance.name,
      count: records.length,
    });
    return records;
  }

  // ----------------------------------------------------------
  // fetchMessages
  // POST /chat/findMessages/{instanceName}
  //
  // Trae el historial de mensajes de un chat específico.
  // Indispensable para mostrar conversaciones previas en el CRM
  // antes de que el cliente conectara ChatFast.
  //
  // count: cuántos mensajes traer (default 20, máx 100)
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // fetchGroups
  // POST /group/fetchAllGroups/{instanceName}
  //
  // Trae todos los grupos con su subject (nombre).
  // Usamos getParticipants:false para que sea rápido.
  // ----------------------------------------------------------
  async fetchGroups(instanceId: string): Promise<{ id: string; subject: string }[]> {
    const instance = await getConnectedInstance(instanceId);

    try {
      const raw = await withRetry(async () => {
        const res = await getEvolutionClient().post(
          `/group/fetchAllGroups/${instance.name}`,
          { getParticipants: false }
        );
        return res.data;
      }, 'fetchGroups');

      const records = Array.isArray(raw) ? raw : (raw?.groups ?? raw?.records ?? []);
      logger.info('[FetchService] Groups fetched', { instanceName: instance.name, count: records.length });
      return records;
    } catch (err: any) {
      // No fatal — si falla, el sync sigue sin nombres de grupos
      logger.warn('[FetchService] fetchGroups failed, group names may be missing', { error: err.message });
      return [];
    }
  }

  // ----------------------------------------------------------
  // fetchMessages
  // POST /chat/findMessages/{instanceName}
  //
  // Trae el historial de mensajes de un chat específico.
  // Indispensable para mostrar conversaciones previas en el CRM
  // antes de que el cliente conectara ChatFast.
  //
  // count: cuántos mensajes traer (default 20, máx 100)
  // ----------------------------------------------------------
  async fetchMessages(instanceId: string, remoteJid: string, count = 20): Promise<FetchedMessage[]> {
    const instance = await getConnectedInstance(instanceId);

    const raw = await withRetry(async () => {
      const res = await getEvolutionClient().post(
        `/chat/findMessages/${instance.name}`,
        { where: { key: { remoteJid } }, limit: count }
      );
      return res.data;
    }, 'fetchMessages');

    // Evolution v2 devuelve una estructura paginada, NO un array plano:
    // { messages: { total, pages, currentPage, records: [...] } }
    // Normalizamos a array para que el frontend reciba algo consistente.
    const records: FetchedMessage[] = normalizeRecords(raw);

    logger.info('[FetchService] Messages fetched', {
      instanceName: instance.name,
      remoteJid,
      total:  raw?.messages?.total ?? raw?.total ?? records.length,
      count:  records.length,
    });
    return records;
  }
}

export const fetchService = new FetchService();
export default fetchService;