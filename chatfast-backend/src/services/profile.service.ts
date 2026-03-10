import axios, { AxiosInstance } from 'axios';
import { evolutionApi } from '../config/evolution';
import instanceRepository from '../repositories/instances.repository';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';
import type {
  UpdateProfilePictureDto,
  UpdateProfileNameDto,
  UpdateProfileStatusDto,
  RevokeMessageDto,
} from '../validators/profile.validator';

// ============================================================
// CONSTANTES
// ============================================================

const CONNECTED_STATES     = new Set(['CONNECTED', 'open']);
const EVOLUTION_TIMEOUT_MS = 10_000;
const MAX_RETRIES          = 2;
const RETRY_BASE_DELAY_MS  = 300;
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
    logger.error(`[ProfileService] Evolution error in "${context}"`, {
      status, url: error.config?.url, evolutionResponse: error.response?.data,
    });
    if (status === 400) return new AppError('VALIDATION_ERROR',  `Evolution rechazó los datos: ${message}`, 400);
    if (status === 401) return new AppError('UNAUTHORIZED',      'API Key de Evolution inválida', 401);
    if (status === 403) return new AppError('FORBIDDEN',         'Sin permisos para esta operación', 403);
    if (status === 404) return new AppError('NOT_FOUND',         `No encontrado: ${message}`, 404);
    if (status === 429) return new AppError('RATE_LIMITED',      'Demasiadas solicitudes. Intenta más tarde.', 429);
    return new AppError('EVOLUTION_API_ERROR', `Evolution falló (${status}): ${message}`, 502);
  }
  logger.error(`[ProfileService] Unexpected error in "${context}"`, { error });
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
        logger.warn(`[ProfileService] Retrying "${context}" (${attempt}/${MAX_RETRIES}) in ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw toAppError(lastError, context);
}

async function getConnectedInstance(instanceId: string) {
  const instance = await instanceRepository.findById(instanceId);
  if (!instance) throw new AppError('NOT_FOUND', `Instancia "${instanceId}" no encontrada`, 404);
  if (!CONNECTED_STATES.has(instance.status)) {
    throw new AppError(
      'INSTANCE_DISCONNECTED',
      `La instancia "${instance.name}" no está conectada (estado: ${instance.status})`,
      409
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
// PROFILE SERVICE
// ============================================================

class ProfileService {

  // ----------------------------------------------------------
  // updateProfilePicture
  // POST /chat/updateProfilePicture/{instanceName}
  //
  // Cambia la foto de perfil del número conectado.
  // Acepta URL pública o base64 de la imagen.
  // ----------------------------------------------------------
  async updateProfilePicture(instanceId: string, data: UpdateProfilePictureDto): Promise<any> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post(
        `/chat/updateProfilePicture/${instance.name}`,
        { picture: data.picture }
      );
      return res.data;
    }, 'updateProfilePicture');

    logger.info('[ProfileService] Profile picture updated', {
      instanceName: instance.name,
    });
    return result;
  }

  // ----------------------------------------------------------
  // updateProfileName
  // POST /chat/updateProfileName/{instanceName}
  //
  // Cambia el nombre visible (PushName) del número.
  // Es el nombre que ven los contactos cuando les llega un mensaje.
  // ----------------------------------------------------------
  async updateProfileName(instanceId: string, data: UpdateProfileNameDto): Promise<any> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post(
        `/chat/updateProfileName/${instance.name}`,
        { name: data.name }
      );
      return res.data;
    }, 'updateProfileName');

    logger.info('[ProfileService] Profile name updated', {
      instanceName: instance.name,
      newName:      data.name,
    });
    return result;
  }

  // ----------------------------------------------------------
  // updateProfileStatus
  // POST /chat/updateProfileStatus/{instanceName}
  //
  // Cambia el estado/bio del número (el texto debajo del nombre).
  // Máx 139 caracteres — límite de WhatsApp.
  // ----------------------------------------------------------
  async updateProfileStatus(instanceId: string, data: UpdateProfileStatusDto): Promise<any> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post(
        `/chat/updateProfileStatus/${instance.name}`,
        { status: data.status }
      );
      return res.data;
    }, 'updateProfileStatus');

    logger.info('[ProfileService] Profile status updated', {
      instanceName: instance.name,
      status:       data.status,
    });
    return result;
  }

  // ----------------------------------------------------------
  // revokeMessage (Eliminar para todos)
  // DELETE /message/delete/{instanceName}
  //
  // Borra el mensaje de la pantalla del receptor.
  // Requiere el key.id del mensaje — obtenlo de la respuesta
  // del sendText/sendMedia o del webhook MESSAGES_UPSERT.
  //
  // IMPORTANTE:
  //   - Solo puedes borrar mensajes enviados por TI (fromMe: true)
  //   - WhatsApp muestra "Este mensaje fue eliminado" en su lugar
  //   - No hay tiempo límite en la API, pero WhatsApp puede tener
  //     restricciones no documentadas para mensajes muy antiguos
  // ----------------------------------------------------------
  async revokeMessage(instanceId: string, data: RevokeMessageDto): Promise<any> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      // Evolution v2 usa POST para /message/delete, no DELETE
      const res = await getEvolutionClient().post(
        `/message/delete/${instance.name}`,
        { key: data.key }
      );
      return res.data;
    }, 'revokeMessage');

    logger.info('[ProfileService] Message revoked', {
      instanceName: instance.name,
      messageId:    data.key.id,
      remoteJid:    data.key.remoteJid,
    });
    return result;
  }
}

export const profileService = new ProfileService();
export default profileService;