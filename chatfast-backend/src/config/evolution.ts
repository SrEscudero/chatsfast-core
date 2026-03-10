import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { config } from './index';
import { logger } from './logger';

class EvolutionApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.EVOLUTION_API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.EVOLUTION_API_KEY,
      },
    });

    // Request interceptor para logging
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        logger.debug('Evolution API Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
        });
        return config;
      },
      (error) => {
        logger.error('Evolution API Request Error', { error });
        return Promise.reject(error);
      }
    );

    // Response interceptor para logging y manejo de errores
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Evolution API Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('Evolution API Response Error', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );
  }

  getInstance(): AxiosInstance {
    return this.client;
  }
}

export const evolutionApi = new EvolutionApiClient();
export default evolutionApi;