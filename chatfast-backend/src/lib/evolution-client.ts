import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface EvolutionConfig {
  baseURL: string;
  apiKey: string;
}

interface CreateInstanceDto {
  instanceName: string;
  token?: string;
  qrcode?: boolean;
}

interface WebhookDto {
  url: string;
  events?: string[];
  webhook_by_events?: boolean;
}

class EvolutionClient {
  private client: AxiosInstance;

  constructor(config: EvolutionConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey,
      },
    });
  }

  // ============================================
  // INSTANCIAS
  // ============================================

  async createInstance(data: CreateInstanceDto) {
    try {
      const response = await this.client.post('/instance/create', {
        instanceName: data.instanceName,
        token: data.token || data.instanceName,
        qrcode: data.qrcode !== false,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error creating Evolution instance:', error.response?.data || error.message);
      throw error;
    }
  }

  async connectionState(instanceName: string) {
    try {
      const response = await this.client.get(`/instance/connectionState/${instanceName}`);
      return response.data;
    } catch (error: any) {
       console.error(`Error fetching state for ${instanceName}:`, error.response?.data || error.message);
       throw error;
    }
  }

  // ============================================
  // QR CODE
  // ============================================

  async getQRCode(instanceName: string) {
    const response = await this.client.get(`/instance/connect/${instanceName}`);
    return response.data;
  }

  // ============================================
  // WEBHOOKS
  // ============================================

  async setWebhook(instanceName: string, data: WebhookDto) {
    const response = await this.client.post(`/webhook/set/${instanceName}`, {
      url: data.url,
      events: data.events || [
        'MESSAGES_UPSERT',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
      ],
      webhook_by_events: data.webhook_by_events ?? true,
    });
    return response.data;
  }
}

// Exportar instancia singleton usando las variables de tu .env
export const evolutionClient = new EvolutionClient({
  baseURL: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  apiKey: process.env.EVOLUTION_API_KEY || '',
});