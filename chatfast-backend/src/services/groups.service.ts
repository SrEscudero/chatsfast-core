import axios, { AxiosInstance } from 'axios';
import { evolutionApi } from '../config/evolution';
import instanceRepository from '../repositories/instances.repository';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';
import type {
  CreateGroupDto,
  UpdateGroupSubjectDto,
  UpdateGroupDescriptionDto,
  UpdateGroupPictureDto,
  AddParticipantsDto,
  RemoveParticipantsDto,
  PromoteParticipantsDto,
  DemoteParticipantsDto,
} from '../validators/groups.validator';

// ============================================================
// TIPOS DE RESPUESTA — Evolution API v2 Groups
// ============================================================

interface GroupResponse {
  id:           string;   // JID del grupo: "120363xxxxxx@g.us"
  subject:      string;   // Nombre del grupo
  subjectOwner?: string;
  subjectTime?:  number;
  creation?:     number;
  owner?:        string;
  desc?:         string;
  descId?:       string;
  restrict?:     boolean;
  announce?:     boolean;
  participants?: GroupParticipant[];
}

interface GroupParticipant {
  id:     string;  // JID del participante
  admin?: 'admin' | 'superadmin' | null;
}

interface ParticipantsActionResponse {
  [jid: string]: {
    status:  number;
    message: string;
  };
}

interface InviteCodeResponse {
  inviteCode: string;
  inviteUrl:  string;
}

// ============================================================
// CONSTANTES
// ============================================================

const CONNECTED_STATES     = new Set(['CONNECTED', 'open']);
const EVOLUTION_TIMEOUT_MS = 10_000;
const MAX_RETRIES          = 2;
const RETRY_BASE_DELAY_MS  = 300;
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 422]);

// ============================================================
// NORMALIZACIÓN
// ============================================================

function toJid(number: string): string {
  if (number.endsWith('@s.whatsapp.net') || number.endsWith('@g.us')) return number;
  return `${number}@s.whatsapp.net`;
}

function toGroupJid(groupJid: string): string {
  if (groupJid.endsWith('@g.us')) return groupJid;
  return `${groupJid}@g.us`;
}

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
    logger.error(`[GroupsService] Evolution error in "${context}"`, {
      status, url: error.config?.url, evolutionResponse: error.response?.data,
    });
    if (status === 400) return new AppError('VALIDATION_ERROR',  `Evolution rechazó los datos: ${message}`, 400);
    if (status === 401) return new AppError('UNAUTHORIZED',      'API Key de Evolution inválida', 401);
    if (status === 403) return new AppError('FORBIDDEN',         'Sin permisos. ¿Eres admin del grupo?', 403);
    if (status === 404) return new AppError('NOT_FOUND',         `No encontrado: ${message}`, 404);
    if (status === 429) return new AppError('RATE_LIMITED',      'Demasiadas solicitudes. Intenta más tarde.', 429);
    return new AppError('EVOLUTION_API_ERROR', `Evolution falló (${status}): ${message}`, 502);
  }
  logger.error(`[GroupsService] Unexpected error in "${context}"`, { error });
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
        logger.warn(`[GroupsService] Retrying "${context}" (${attempt}/${MAX_RETRIES}) in ${delayMs}ms`);
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
// GROUPS SERVICE
// ============================================================

class GroupsService {

  // ----------------------------------------------------------
  // createGroup
  // POST /group/create/{instanceName}
  // ----------------------------------------------------------
  async createGroup(instanceId: string, data: CreateGroupDto): Promise<GroupResponse> {
    const instance = await getConnectedInstance(instanceId);

    const payload = {
      subject:      data.subject,
      description:  data.description ?? '',
      participants: data.participants.map(toJid),
    };

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post<GroupResponse>(
        `/group/create/${instance.name}`,
        payload
      );
      return res.data;
    }, 'createGroup');

    logger.info('[GroupsService] Group created', {
      instanceName: instance.name,
      groupId:      result.id,
      subject:      data.subject,
      participants: data.participants.length,
    });

    return result;
  }

  // ----------------------------------------------------------
  // updateSubject
  // POST /group/updateGroupSubject/{instanceName}
  // ----------------------------------------------------------
  async updateSubject(instanceId: string, data: UpdateGroupSubjectDto): Promise<any> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post(
        `/group/updateGroupSubject/${instance.name}`,
        { groupJid: toGroupJid(data.groupJid), subject: data.subject }
      );
      return res.data;
    }, 'updateSubject');

    logger.info('[GroupsService] Group subject updated', {
      instanceName: instance.name,
      groupJid:     data.groupJid,
      newSubject:   data.subject,
    });
    return result;
  }

  // ----------------------------------------------------------
  // updateDescription
  // POST /group/updateGroupDescription/{instanceName}
  // ----------------------------------------------------------
  async updateDescription(instanceId: string, data: UpdateGroupDescriptionDto): Promise<any> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post(
        `/group/updateGroupDescription/${instance.name}`,
        { groupJid: toGroupJid(data.groupJid), description: data.description ?? '' }
      );
      return res.data;
    }, 'updateDescription');

    logger.info('[GroupsService] Group description updated', {
      instanceName: instance.name,
      groupJid: data.groupJid,
    });
    return result;
  }

  // ----------------------------------------------------------
  // updatePicture
  // POST /group/updateGroupPicture/{instanceName}
  // ----------------------------------------------------------
  async updatePicture(instanceId: string, data: UpdateGroupPictureDto): Promise<any> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post(
        `/group/updateGroupPicture/${instance.name}`,
        { groupJid: toGroupJid(data.groupJid), image: data.image }
      );
      return res.data;
    }, 'updatePicture');

    logger.info('[GroupsService] Group picture updated', {
      instanceName: instance.name,
      groupJid: data.groupJid,
    });
    return result;
  }

  // ----------------------------------------------------------
  // addParticipants
  // POST /group/updateParticipant/{instanceName} (action: add)
  // ----------------------------------------------------------
  async addParticipants(instanceId: string, data: AddParticipantsDto): Promise<ParticipantsActionResponse> {
    return this.updateParticipants(instanceId, data.groupJid, data.participants, 'add', 'addParticipants');
  }

  // ----------------------------------------------------------
  // removeParticipants
  // POST /group/updateParticipant/{instanceName} (action: remove)
  // ----------------------------------------------------------
  async removeParticipants(instanceId: string, data: RemoveParticipantsDto): Promise<ParticipantsActionResponse> {
    return this.updateParticipants(instanceId, data.groupJid, data.participants, 'remove', 'removeParticipants');
  }

  // ----------------------------------------------------------
  // promoteParticipants (→ admin)
  // POST /group/updateParticipant/{instanceName} (action: promote)
  // ----------------------------------------------------------
  async promoteParticipants(instanceId: string, data: PromoteParticipantsDto): Promise<ParticipantsActionResponse> {
    return this.updateParticipants(instanceId, data.groupJid, data.participants, 'promote', 'promoteParticipants');
  }

  // ----------------------------------------------------------
  // demoteParticipants (admin → miembro)
  // POST /group/updateParticipant/{instanceName} (action: demote)
  // ----------------------------------------------------------
  async demoteParticipants(instanceId: string, data: DemoteParticipantsDto): Promise<ParticipantsActionResponse> {
    return this.updateParticipants(instanceId, data.groupJid, data.participants, 'demote', 'demoteParticipants');
  }

  // Helper centralizado para todas las acciones de participantes
  private async updateParticipants(
    instanceId:   string,
    groupJid:     string,
    participants: string[],
    action:       'add' | 'remove' | 'promote' | 'demote',
    context:      string
  ): Promise<ParticipantsActionResponse> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post<ParticipantsActionResponse>(
        `/group/updateParticipant/${instance.name}`,
        {
          groupJid:     toGroupJid(groupJid),
          action,
          participants: participants.map(toJid),
        }
      );
      return res.data;
    }, context);

    logger.info(`[GroupsService] Participants ${action}`, {
      instanceName: instance.name,
      groupJid,
      action,
      count: participants.length,
    });
    return result;
  }

  // ----------------------------------------------------------
  // getInviteCode
  // POST /group/inviteCode/{instanceName}
  // ----------------------------------------------------------
  async getInviteCode(instanceId: string, groupJid: string): Promise<InviteCodeResponse> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post<InviteCodeResponse>(
        `/group/inviteCode/${instance.name}`,
        { groupJid: toGroupJid(groupJid) }
      );
      return res.data;
    }, 'getInviteCode');

    logger.info('[GroupsService] Invite code fetched', {
      instanceName: instance.name,
      groupJid,
    });
    return result;
  }

  // ----------------------------------------------------------
  // revokeInviteCode
  // POST /group/revokeInviteCode/{instanceName}
  // Genera un nuevo link e invalida el anterior
  // ----------------------------------------------------------
  async revokeInviteCode(instanceId: string, groupJid: string): Promise<InviteCodeResponse> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post<InviteCodeResponse>(
        `/group/revokeInviteCode/${instance.name}`,
        { groupJid: toGroupJid(groupJid) }
      );
      return res.data;
    }, 'revokeInviteCode');

    logger.info('[GroupsService] Invite code revoked', {
      instanceName: instance.name,
      groupJid,
    });
    return result;
  }

  // ----------------------------------------------------------
  // leaveGroup
  // POST /group/leaveGroup/{instanceName}
  // ----------------------------------------------------------
  async leaveGroup(instanceId: string, groupJid: string): Promise<any> {
    const instance = await getConnectedInstance(instanceId);

    const result = await withRetry(async () => {
      const res = await getEvolutionClient().post(
        `/group/leaveGroup/${instance.name}`,
        { groupJid: toGroupJid(groupJid) }
      );
      return res.data;
    }, 'leaveGroup');

    logger.info('[GroupsService] Left group', {
      instanceName: instance.name,
      groupJid,
    });
    return result;
  }
}

export const groupsService = new GroupsService();
export default groupsService;