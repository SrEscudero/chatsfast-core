import { Instance, InstanceStatus } from '@prisma/client';
import axios from 'axios';
import { evolutionApi } from '../config/evolution';
import instanceRepository from '../repositories/instances.repository';
import { logger } from '../config/logger';
import { CreateInstanceDto, UpdateInstanceDto } from '../validators/instance.validator';

// ============================================================
// HELPERS
// ============================================================

/**
 * extractEvolutionError
 *
 * Evolution API retorna errores con distintas estructuras según la versión.
 * Esta función normaliza el mensaje para que siempre sea legible en los logs.
 *
 * Versión 1.x: { message: "..." }
 * Versión 2.x: { response: { message: [...] } } o { error: "...", message: "..." }
 */
function extractEvolutionError(error: unknown): string {
  if (!axios.isAxiosError(error)) return String(error);
  const data = error.response?.data;
  if (!data) return error.message;

  // Formato v2: { response: { message: ["algo falló"] } }
  if (data?.response?.message) {
    return Array.isArray(data.response.message)
      ? data.response.message.join(', ')
      : String(data.response.message);
  }

  // Formato alternativo v2: { error: "...", message: "..." }
  if (data?.message) return String(data.message);
  if (data?.error) return String(data.error);

  return JSON.stringify(data);
}

/**
 * mapEvolutionStatus
 *
 * Evolution API retorna estados en texto libre. Los mapeamos al enum de Prisma.
 *
 * Estados conocidos de Evolution API:
 *  open       → WhatsApp conectado y operativo
 *  connecting → Esperando escaneo de QR
 *  close      → Sesión cerrada (normal)
 *  refused    → Conexión rechazada (ban o error)
 */
function mapEvolutionStatus(status: string): InstanceStatus {
  const statusMap: Record<string, InstanceStatus> = {
    open: InstanceStatus.CONNECTED,
    connecting: InstanceStatus.CONNECTING,
    close: InstanceStatus.DISCONNECTED,
    refused: InstanceStatus.ERROR,
  };
  return statusMap[status] ?? InstanceStatus.DISCONNECTED;
}

// ============================================================
// CLASE DE SERVICIO
// ============================================================

class InstanceService {

  // ----------------------------------------------------------
  // createInstance
  // ----------------------------------------------------------
  /**
   * Crea una instancia en Evolution API y la registra en la DB.
   *
   * FLUJO:
   * 1. Verifica que el nombre no esté duplicado en la DB
   * 2. Llama a POST /instance/create en Evolution API
   * 3. Guarda el registro en PostgreSQL
   * 4. Configura el webhook automáticamente
   *
   * POSIBLES ERRORES DE EVOLUTION API (400):
   * - Nombre duplicado en Evolution API (instancia ya existe allí aunque no en DB)
   * - Nombre con caracteres inválidos (Evolution API es estricto con el nombre)
   * - Token con formato incorrecto
   * - Campo `integration` requerido en Evolution API v2
   *
   * SOLUCIÓN si sigue fallando:
   * Revisar los logs — esta versión loggea el cuerpo completo del error 400.
   */
  async createInstance(data: CreateInstanceDto): Promise<Instance> {
    // 1. Verificar unicidad en nuestra DB
    const existingInstance = await instanceRepository.findByName(data.name);
    if (existingInstance) {
      const err = new Error(`Ya existe una instancia con el nombre "${data.name}"`);
      (err as any).statusCode = 409;
      (err as any).code = 'CONFLICT';
      throw err;
    }

    // 2. Preparar payload para Evolution API
    // NOTA: Evolution API v2 requiere el campo "integration".
    // Si tu versión es v1, puedes quitar ese campo.
    // El token es opcional — si Evolution API lo rechaza, prueba sin él.
    const uniqueToken = `chatfast_${data.name}_${Date.now()}`;

    const evolutionPayload = {
      instanceName: data.name,
      token: uniqueToken,
      qrcode: true,
      // Campo requerido en Evolution API v2+
      // Valores válidos: "WHATSAPP-BAILEYS" | "WHATSAPP-BUSINESS"
      integration: data.connectionType === 'WHATSAPP_CLOUD'
        ? 'WHATSAPP-BUSINESS'
        : 'WHATSAPP-BAILEYS',
    };

    logger.debug('Sending payload to Evolution API', { payload: evolutionPayload });

    let evolutionResponse;
    try {
      evolutionResponse = await evolutionApi.getInstance().post('/instance/create', evolutionPayload);
      logger.debug('Evolution API response', { data: evolutionResponse.data });
    } catch (error) {
      // Loggear el error COMPLETO de Evolution API para poder diagnosticar
      if (axios.isAxiosError(error)) {
        logger.error('Evolution API create instance failed', {
          status: error.response?.status,
          // Este campo contiene el mensaje real de Evolution API
          evolutionError: error.response?.data,
          // Este muestra exactamente qué enviamos
          requestPayload: evolutionPayload,
          evolutionUrl: error.config?.url,
        });

        const humanMessage = extractEvolutionError(error);
        const appError = new Error(`Evolution API rechazó la solicitud: ${humanMessage}`);
        (appError as any).statusCode = 502;
        (appError as any).code = 'EVOLUTION_API_ERROR';
        throw appError;
      }
      throw error;
    }

    // 3. Extraer el ID que Evolution API asignó a la instancia
    // Evolution API v1 retorna: { instance: { instanceId: "..." } }
    // Evolution API v2 retorna: { instance: { instanceName: "..." } }
    const evolutionInstanceId =
      evolutionResponse.data.instance?.instanceId ||
      evolutionResponse.data.instance?.instanceName ||
      data.name;

    // 4. Guardar en nuestra base de datos
    const instance = await instanceRepository.create({
      name: data.name,
      evolutionApiId: evolutionInstanceId,
      clientId: data.clientId,
      apiKey: uniqueToken,
      status: InstanceStatus.PENDING,
      connectionType: data.connectionType || 'BAILEYS',
    });

    // 5. Configurar webhook (no bloqueante — fallo silencioso con log)
    await this.setupWebhook(data.name);

    logger.info('Instance created successfully', {
      instanceId: instance.id,
      evolutionInstanceId,
      name: data.name,
    });

    return instance;
  }

  // ----------------------------------------------------------
  // getInstanceById
  // ----------------------------------------------------------
  async getInstanceById(id: string): Promise<Instance> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    // Sincronizar estado con Evolution API (no bloqueante si falla)
    await this.syncInstanceStatus(instance);
    return instance;
  }

  // ----------------------------------------------------------
  // getAllInstances
  // ----------------------------------------------------------
  async getAllInstances(filters: any): Promise<{ instances: Instance[]; total: number }> {
    return instanceRepository.findMany(filters);
  }

  // ----------------------------------------------------------
  // updateInstance
  // ----------------------------------------------------------
  async updateInstance(id: string, data: UpdateInstanceDto): Promise<Instance> {
    const existingInstance = await instanceRepository.findById(id);
    if (!existingInstance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    // Verificar unicidad del nuevo nombre (si se está cambiando)
    if (data.name && data.name !== existingInstance.name) {
      const duplicate = await instanceRepository.findByName(data.name);
      if (duplicate) {
        const err = new Error(`Ya existe una instancia con el nombre "${data.name}"`);
        (err as any).statusCode = 409;
        (err as any).code = 'CONFLICT';
        throw err;
      }
    }

    return instanceRepository.update(id, data);
  }

  // ----------------------------------------------------------
  // deleteInstance
  // ----------------------------------------------------------
  async deleteInstance(id: string): Promise<void> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    // Intentar eliminar de Evolution API — si falla, continuamos igual
    // (la instancia puede ya no existir en Evolution API)
    try {
      await evolutionApi.getInstance().delete(`/instance/delete/${instance.name}`);
      logger.info('Instance deleted from Evolution API', { instanceName: instance.name });
    } catch (error) {
      logger.warn('Failed to delete from Evolution API (continuing with DB deletion)', {
        instanceName: instance.name,
        evolutionError: axios.isAxiosError(error) ? error.response?.data : error,
      });
    }

    await instanceRepository.delete(id);
    logger.info('Instance deleted from DB', { instanceId: id, name: instance.name });
  }

  // ----------------------------------------------------------
  // getQRCode
  // ----------------------------------------------------------
  async getQRCode(id: string): Promise<{ base64: string; instanceName: string }> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      throw err;
    }

    let response;
    try {
      response = await evolutionApi.getInstance().get(`/instance/connect/${instance.name}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('Evolution API getQR failed', {
          status: error.response?.status,
          evolutionError: error.response?.data,
        });
        const humanMessage = extractEvolutionError(error);
        const appError = new Error(`No se pudo obtener el QR: ${humanMessage}`);
        (appError as any).statusCode = 502;
        throw appError;
      }
      throw error;
    }

    // Evolution API puede retornar el QR en distintos campos según la versión
    const qrCode =
      response.data.base64 ||
      response.data.qrcode?.base64 ||
      response.data.code;

    if (!qrCode) {
      const err = new Error('No se pudo obtener el QR. La instancia puede estar ya conectada.');
      (err as any).statusCode = 400;
      (err as any).code = 'ALREADY_CONNECTED';
      throw err;
    }

    await instanceRepository.updateStatus(id, InstanceStatus.CONNECTING);
    return { base64: qrCode, instanceName: instance.name };
  }

  // ----------------------------------------------------------
  // connectInstance
  // ----------------------------------------------------------
  async connectInstance(id: string): Promise<Instance> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      throw err;
    }

    try {
      await evolutionApi.getInstance().get(`/instance/connect/${instance.name}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const humanMessage = extractEvolutionError(error);
        const appError = new Error(`No se pudo conectar la instancia: ${humanMessage}`);
        (appError as any).statusCode = 502;
        throw appError;
      }
      throw error;
    }

    return instanceRepository.updateStatus(id, InstanceStatus.CONNECTING);
  }

  // ----------------------------------------------------------
  // disconnectInstance
  // ----------------------------------------------------------
  async disconnectInstance(id: string): Promise<Instance> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      throw err;
    }

    if (instance.status === InstanceStatus.DISCONNECTED) {
      const err = new Error('La instancia ya se encuentra en estado DISCONNECTED');
      (err as any).statusCode = 400;
      (err as any).code = 'ALREADY_DISCONNECTED';
      throw err;
    }

    try {
      await evolutionApi.getInstance().post(`/instance/logout/${instance.name}`);
    } catch (error) {
      // Si Evolution API falla al logout, actualizamos el estado en DB de todas formas
      logger.warn('Evolution API logout failed, forcing status update', {
        instanceName: instance.name,
        evolutionError: axios.isAxiosError(error) ? error.response?.data : error,
      });
    }

    return instanceRepository.updateStatus(id, InstanceStatus.DISCONNECTED);
  }

  // ----------------------------------------------------------
  // restartInstance
  // ----------------------------------------------------------
  async restartInstance(id: string): Promise<Instance> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      throw err;
    }

    // Desconectar (ignorar error si ya estaba desconectada)
    try {
      await evolutionApi.getInstance().post(`/instance/logout/${instance.name}`);
      await instanceRepository.updateStatus(id, InstanceStatus.DISCONNECTED);
    } catch {
      logger.debug('Logout failed during restart, continuing', { instanceName: instance.name });
    }

    // Esperar 2 segundos antes de reconectar
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Reconectar
    try {
      await evolutionApi.getInstance().get(`/instance/connect/${instance.name}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const humanMessage = extractEvolutionError(error);
        throw new Error(`Reconexión fallida: ${humanMessage}`);
      }
      throw error;
    }

    return instanceRepository.updateStatus(id, InstanceStatus.CONNECTING);
  }

  // ----------------------------------------------------------
  // getInstanceStatus
  // ----------------------------------------------------------
  async getInstanceStatus(id: string): Promise<object> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      throw err;
    }

    try {
      const response = await evolutionApi.getInstance().get(
        `/instance/connectionState/${instance.name}`
      );
      const state = response.data.instance?.state ?? response.data.state;
      const mappedStatus = mapEvolutionStatus(state);

      // Actualizar DB si el estado cambió
      if (mappedStatus !== instance.status) {
        await instanceRepository.updateStatus(id, mappedStatus);
      }

      return {
        status: mappedStatus,
        rawState: state,
        phoneNumber: instance.phoneNumber,
        lastSeen: instance.lastSeen,
      };
    } catch (error) {
      logger.warn('Failed to fetch status from Evolution API', {
        instanceId: id,
        evolutionError: axios.isAxiosError(error) ? error.response?.data : error,
      });
      // Retornar el estado guardado en DB como fallback
      return { status: instance.status, source: 'db_cache' };
    }
  }

  // ----------------------------------------------------------
  // getWebhook / updateWebhook
  // ----------------------------------------------------------
  async getWebhook(id: string): Promise<object> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      throw err;
    }

    try {
      const response = await evolutionApi.getInstance().get(`/webhook/find/${instance.name}`);
      return response.data;
    } catch (error) {
      logger.warn('Failed to fetch webhook config', {
        instanceName: instance.name,
        evolutionError: axios.isAxiosError(error) ? error.response?.data : error,
      });
      return { url: instance.webhookUrl, source: 'db_cache' };
    }
  }

  async updateWebhook(id: string, webhookData: { url: string; events?: string[]; enabled?: boolean }): Promise<object> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      throw err;
    }

    try {
      // Evolution API v2 REQUIERE el payload dentro de { webhook: { ... } }
      // Enviar campos al nivel raíz → 400 "instance requires property webhook"
      // byEvents: false = todos los eventos van a la misma URL (recomendado)
      // byEvents: true  = cada evento tiene su propia ruta: {url}/{event_name}
      const response = await evolutionApi.getInstance().post(`/webhook/set/${instance.name}`, {
        webhook: {
          enabled: webhookData.enabled ?? true,
          url: webhookData.url,
          byEvents: false,
          base64: false,
          events: webhookData.events ?? [
            'MESSAGES_UPSERT',   // Mensajes nuevos
            'MESSAGES_UPDATE',   // Leído, entregado
            'CONNECTION_UPDATE', // Cambios de estado de conexión
            'QRCODE_UPDATED',    // Nuevo QR generado
            'CALL',              // ✅ Nombre correcto. CALL_UPSERT no existe en v2
          ],
        },
      });

      // Actualizar la URL en nuestra DB también
      await instanceRepository.update(id, { webhookUrl: webhookData.url } as any);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const humanMessage = extractEvolutionError(error);
        throw new Error(`No se pudo actualizar el webhook: ${humanMessage}`);
      }
      throw error;
    }
  }

  // ----------------------------------------------------------
  // getMetrics (stub — implementar con datos reales de DB)
  // ----------------------------------------------------------
  async getMetrics(id: string, period: string = '24h'): Promise<object> {
    const instance = await instanceRepository.findById(id);
    if (!instance) {
      const err = new Error(`Instancia con ID "${id}" no encontrada`);
      (err as any).statusCode = 404;
      throw err;
    }

    // TODO: Implementar consulta real a tabla de métricas/mensajes
    // Por ahora retorna estructura básica
    return {
      instanceId: id,
      period,
      messagesIn: 0,
      messagesOut: 0,
      errors: 0,
      uptime: null,
      lastActivity: instance.lastSeen,
      note: 'Implementar con datos reales de la tabla de mensajes',
    };
  }

  // ----------------------------------------------------------
  // MÉTODOS PRIVADOS
  // ----------------------------------------------------------

  /**
   * setupWebhook
   *
   * Configura el webhook de Evolution API para que envíe eventos
   * a nuestro endpoint interno. Se llama automáticamente al crear
   * una instancia. El fallo es silencioso — se puede reconfigurar
   * manualmente con PUT /instances/:id/webhook.
   */
  private async setupWebhook(instanceName: string): Promise<void> {
    try {
      const webhookUrl = `${process.env.BASE_URL ?? 'http://localhost:3001'}/api/v1/webhooks/evolution`;
      // Evolution API v2 REQUIRES the payload wrapped inside { webhook: { ... } }
      // Flat format (url, events at root) = 400 "instance requires property webhook"
      await evolutionApi.getInstance().post(`/webhook/set/${instanceName}`, {
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,   // false = todos los eventos van a la misma URL
          base64: false,
          // ENUM COMPLETO Evolution API v2 — solo los más relevantes activados por default:
          // APPLICATION_STARTUP | QRCODE_UPDATED | MESSAGES_SET | MESSAGES_UPSERT
          // MESSAGES_EDITED | MESSAGES_UPDATE | MESSAGES_DELETE | SEND_MESSAGE
          // SEND_MESSAGE_UPDATE | CONTACTS_SET | CONTACTS_UPSERT | CONTACTS_UPDATE
          // PRESENCE_UPDATE | CHATS_SET | CHATS_UPSERT | CHATS_UPDATE | CHATS_DELETE
          // GROUPS_UPSERT | GROUP_UPDATE | GROUP_PARTICIPANTS_UPDATE | CONNECTION_UPDATE
          // LABELS_EDIT | LABELS_ASSOCIATION | CALL | TYPEBOT_START | TYPEBOT_CHANGE_STATUS
          // REMOVE_INSTANCE | LOGOUT_INSTANCE | INSTANCE_CREATE | INSTANCE_DELETE | STATUS_INSTANCE
          events: [
            'MESSAGES_UPSERT',    // Mensajes nuevos (recibidos y enviados)
            'MESSAGES_UPDATE',    // Leído, entregado, etc.
            'CONNECTION_UPDATE',  // Conectado / desconectado / QR
            'QRCODE_UPDATED',     // Nuevo QR generado
            'CALL',               // ✅ Correcto. NO existe CALL_UPSERT en Evolution API v2
          ],
        },
      });
      logger.info('Webhook configured for instance', { instanceName, webhookUrl });
    } catch (error) {
      // No lanzamos el error — la instancia se creó OK, el webhook es opcional
      logger.error('Failed to setup webhook (non-fatal)', {
        instanceName,
        evolutionError: axios.isAxiosError(error) ? error.response?.data : error,
      });
    }
  }

  /**
   * syncInstanceStatus
   *
   * Consulta el estado real de la instancia en Evolution API y lo
   * sincroniza en nuestra DB si cambió. Llamado en cada GET /:id.
   * El fallo es silencioso — retornamos el estado en DB como fallback.
   */
  private async syncInstanceStatus(instance: Instance): Promise<void> {
    try {
      const response = await evolutionApi.getInstance().get(
        `/instance/connectionState/${instance.name}`
      );
      const state = response.data.instance?.state ?? response.data.state;
      const mappedStatus = mapEvolutionStatus(state);

      if (mappedStatus !== instance.status) {
        await instanceRepository.updateStatus(instance.id, mappedStatus);
        logger.debug('Instance status synced', {
          instanceId: instance.id,
          oldStatus: instance.status,
          newStatus: mappedStatus,
        });
      }
    } catch (error) {
      // Fallo silencioso — no interrumpir el GET por esto
      logger.debug('Failed to sync instance status (using DB value)', {
        instanceId: instance.id,
        evolutionError: axios.isAxiosError(error) ? error.response?.data : error,
      });
    }
  }
}

export const instanceService = new InstanceService();
export default instanceService;