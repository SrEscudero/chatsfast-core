import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: attach access token ────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: handle 401 → refresh ──────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('no refresh token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        const newToken = data.data.accessToken;
        localStorage.setItem('accessToken', newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login:   (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout:  (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
  me:      () => api.get('/auth/me'),
};

export const overviewApi = {
  getStats:  () => api.get('/admin/overview'),
  getHealth: () => api.get('/admin/health'),
};

export const instancesApi = {
  list:       (params?: Record<string, unknown>) => api.get('/admin/instances', { params }),
  listMine:   (params?: Record<string, unknown>) => api.get('/instances', { params }),
  getById:    (id: string) => api.get(`/instances/${id}`),
  create:     (data: Record<string, unknown>) => api.post('/instances', data),
  update:     (id: string, data: Record<string, unknown>) => api.put(`/instances/${id}`, data),
  delete:     (id: string) => api.delete(`/instances/${id}`),
  connect:    (id: string) => api.post(`/instances/${id}/connect`),
  disconnect: (id: string) => api.post(`/instances/${id}/disconnect`),
  restart:    (id: string) => api.post(`/instances/${id}/restart`),
  getQR:      (id: string) => api.get(`/instances/${id}/qr`),
  getStatus:  (id: string) => api.get(`/instances/${id}/status`),
  getWebhook: (id: string) => api.get(`/instances/${id}/webhook`),
  setWebhook: (id: string, data: Record<string, unknown>) => api.put(`/instances/${id}/webhook`, data),
  getSettings: (id: string) => api.get(`/instances/${id}/settings`),
  setSettings: (id: string, data: Record<string, unknown>) => api.put(`/instances/${id}/settings`, data),
};

export const clientsApi = {
  list:       (params?: Record<string, unknown>) => api.get('/clients', { params }),
  getById:    (id: string) => api.get(`/clients/${id}`),
  create:     (data: Record<string, unknown>) => api.post('/clients', data),
  update:     (id: string, data: Record<string, unknown>) => api.put(`/clients/${id}`, data),
  delete:     (id: string) => api.delete(`/clients/${id}`),
  suspend:    (id: string) => api.post(`/clients/${id}/suspend`),
  reactivate: (id: string) => api.post(`/clients/${id}/reactivate`),
};

export const contactsApi = {
  list:        (instanceId: string, params?: Record<string, unknown>) =>
                 api.get(`/instances/${instanceId}/contacts`, { params }),
  sync:        (instanceId: string) =>
                 api.post(`/instances/${instanceId}/contacts/sync`),
  startChat:   (instanceId: string, phone: string) =>
                 api.post(`/instances/${instanceId}/contacts/start`, { phone }),
  getMessages: (instanceId: string, contactId: string, params?: Record<string, unknown>) =>
                 api.get(`/instances/${instanceId}/contacts/${contactId}/messages`, { params }),
  sendText:    (instanceId: string, to: string, text: string) =>
                 api.post(`/instances/${instanceId}/messages/text`, { number: to, text }),
  sendMedia:   (instanceId: string, to: string, mediatype: string, media: string, caption?: string) =>
                 api.post(`/instances/${instanceId}/messages/media`, { number: to, mediatype, media, caption }),
  markAsRead:  (instanceId: string, remoteJid: string, messageIds: string[]) =>
                 api.post(`/instances/${instanceId}/chat/mark-read`, { remoteJid, messages: messageIds }),
  sendPresence: (instanceId: string, number: string, presence: 'composing' | 'recording' | 'paused', delay?: number) =>
                 api.post(`/instances/${instanceId}/chat/presence`, { number, presence, ...(delay ? { delay } : {}) }),
  getMedia: (instanceId: string, contactId: string, messageId: string) =>
                 api.get(`/instances/${instanceId}/contacts/${contactId}/messages/${messageId}/media`, { responseType: 'blob' }),
};

export const campaignsApi = {
  list:   (params?: Record<string, unknown>) => api.get('/campaigns', { params }),
  getById:(id: string) => api.get(`/campaigns/${id}`),
  create: (data: Record<string, unknown>) => api.post('/campaigns', data),
  launch: (id: string) => api.post(`/campaigns/${id}/launch`),
  pause:  (id: string) => api.post(`/campaigns/${id}/pause`),
  cancel: (id: string) => api.post(`/campaigns/${id}/cancel`),
  delete: (id: string) => api.delete(`/campaigns/${id}`),
};

export const infraApi = {
  getHealth:     () => api.get('/infra/health'),
  getMetrics:    () => api.get('/infra/metrics'),
  getContainers: () => api.get('/infra/containers'),
  restart:       (id: string) => api.post(`/infra/containers/${id}/restart`),
  stop:          (id: string) => api.post(`/infra/containers/${id}/stop`),
  start:         (id: string) => api.post(`/infra/containers/${id}/start`),
  prune:         () => api.post('/infra/containers/prune'),
  getDetail:     (id: string) => api.get(`/infra/containers/${id}/detail`),
  getProcesses:  () => api.get('/infra/processes'),
  getNetwork:    () => api.get('/infra/network'),
};

export const SSE_URLS = {
  liveInstances: `${BASE_URL}/admin/instances/live`,
  liveLogs:      `${BASE_URL}/admin/logs`,
  liveMetrics:   `${BASE_URL}/infra/metrics/live`,
  containerLogs: (id: string) => `${BASE_URL}/infra/containers/${id}/logs`,
};
