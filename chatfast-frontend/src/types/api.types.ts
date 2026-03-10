export type Role = 'ADMIN' | 'OPERATOR' | 'CLIENT';
export type Plan = 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
export type InstanceStatus = 'PENDING' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type CampaignItemStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface User {
  id: string; name: string; email: string; role: Role; plan: Plan;
  active: boolean; suspended: boolean; createdAt: string; updatedAt: string;
  _count?: { instances: number };
}

export interface Instance {
  id: string; name: string; status: InstanceStatus; connectionType: string;
  phoneNumber: string | null; lastSeen: string | null; clientId: string;
  client?: { id: string; name: string; email: string } | null; createdAt: string;
}

export interface Contact {
  id: string; instanceId: string; remoteJid: string; name: string | null;
  phone: string | null; profilePic: string | null; isGroup: boolean;
  lastMessage: string | null; lastMessageAt: string | null; unreadCount: number; createdAt: string;
}

export interface Message {
  id: string; instanceId: string; contactId: string; remoteJid: string;
  messageId: string; fromMe: boolean; type: string; content: string | null;
  mediaUrl: string | null; caption: string | null; status: string; timestamp: string; createdAt: string;
}

export interface Campaign {
  id: string; clientId: string; instanceId: string;
  instance?: { id: string; name: string; phoneNumber: string | null };
  name: string; message: string; mediaUrl: string | null; status: CampaignStatus;
  scheduledAt: string | null; startedAt: string | null; completedAt: string | null;
  totalCount: number; sentCount: number; failedCount: number; delayMs: number;
  createdAt: string; _count?: { items: number };
}

export interface CampaignItem {
  id: string; campaignId: string; phone: string; name: string | null;
  status: CampaignItemStatus; sentAt: string | null; error: string | null;
}

export interface OverviewStats {
  clients: { total: number; active: number; suspended: number; byPlan: Record<Plan, number> };
  instances: { total: number; connected: number; connecting: number; disconnected: number; error: number; pending: number };
  sessions: { active: number };
}

export interface HealthStatus {
  database: { status: 'ok' | 'error'; latencyMs: number | null; error?: string };
  evolutionApi: { status: 'ok' | 'error'; latencyMs: number | null; error?: string };
  overall: 'healthy' | 'degraded' | 'unhealthy';
}

export interface SystemMetrics {
  cpu: { manufacturer: string; brand: string; speed: number; cores: number; physicalCores: number; usagePercent: number };
  memory: { totalBytes: number; usedBytes: number; freeBytes: number; usagePercent: number; totalGb: number; usedGb: number; freeGb: number };
  disk: Array<{ mount: string; type: string; totalBytes: number; usedBytes: number; freeBytes: number; usagePercent: number; totalGb: number; freeGb: number }>;
  os: { platform: string; distro: string; release: string; hostname: string; uptime: number; uptimeFormatted: string };
  timestamp: string;
}

export interface ContainerInfo {
  id: string; name: string; image: string; status: string; state: string; created: number;
  ports: Array<{ privatePort: number; publicPort?: number; type: string }>;
}

export interface Pagination { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean; }
export interface PaginatedResponse<T> { items: T[]; pagination: Pagination; }
export interface ApiResponse<T = unknown> { success: boolean; data: T; message?: string; }
