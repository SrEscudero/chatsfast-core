import axios from 'axios';
import { prisma } from '../lib/prisma';
import { evolutionApi } from '../config/evolution';
import { logger } from '../config/logger';

// ============================================================
// TYPES
// ============================================================

export interface OverviewStats {
  clients: {
    total: number;
    active: number;
    suspended: number;
    byPlan: Record<string, number>;
  };
  instances: {
    total: number;
    connected: number;
    connecting: number;
    disconnected: number;
    error: number;
    pending: number;
  };
  sessions: {
    active: number;
  };
}

export interface HealthStatus {
  database: { status: 'ok' | 'error'; latencyMs: number | null; error?: string };
  evolutionApi: { status: 'ok' | 'error'; latencyMs: number | null; error?: string };
  overall: 'healthy' | 'degraded' | 'unhealthy';
}

export interface InstanceSnapshot {
  id: string;
  name: string;
  status: string;
  connectionType: string;
  phoneNumber: string | null;
  lastSeen: Date | null;
  client: { id: string; name: string; email: string } | null;
  createdAt: Date;
}

// ============================================================
// SERVICE
// ============================================================

class AdminService {

  // ----------------------------------------------------------
  // getOverview — global platform stats
  // ----------------------------------------------------------
  async getOverview(): Promise<OverviewStats> {
    const [
      totalClients,
      activeClients,
      suspendedClients,
      clientsByPlan,
      instanceCounts,
      activeSessions,
    ] = await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { active: true, suspended: false } }),
      prisma.client.count({ where: { suspended: true } }),
      prisma.client.groupBy({ by: ['plan'], _count: { _all: true } }),
      prisma.instance.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    ]);

    const byPlan: Record<string, number> = {};
    for (const row of clientsByPlan) {
      byPlan[row.plan] = row._count._all;
    }

    const countByStatus: Record<string, number> = {};
    for (const row of instanceCounts) {
      countByStatus[row.status] = row._count._all;
    }

    return {
      clients: {
        total: totalClients,
        active: activeClients,
        suspended: suspendedClients,
        byPlan,
      },
      instances: {
        total: Object.values(countByStatus).reduce((a, b) => a + b, 0),
        connected: countByStatus['CONNECTED'] ?? 0,
        connecting: countByStatus['CONNECTING'] ?? 0,
        disconnected: countByStatus['DISCONNECTED'] ?? 0,
        error: countByStatus['ERROR'] ?? 0,
        pending: countByStatus['PENDING'] ?? 0,
      },
      sessions: {
        active: activeSessions,
      },
    };
  }

  // ----------------------------------------------------------
  // getHealth — DB + Evolution API health checks
  // ----------------------------------------------------------
  async getHealth(): Promise<HealthStatus> {
    const dbResult = await this.checkDatabase();
    const evolutionResult = await this.checkEvolutionApi();

    let overall: HealthStatus['overall'] = 'healthy';
    if (dbResult.status === 'error') {
      overall = 'unhealthy'; // DB down = no service
    } else if (evolutionResult.status === 'error') {
      overall = 'degraded'; // Evolution down = partial service
    }

    return {
      database: dbResult,
      evolutionApi: evolutionResult,
      overall,
    };
  }

  // ----------------------------------------------------------
  // getAllInstances — paginated list with live status (admin only)
  // ----------------------------------------------------------
  async getAllInstances(opts: {
    page: number;
    limit: number;
    status?: string;
    clientId?: string;
    search?: string;
  }): Promise<{ instances: InstanceSnapshot[]; total: number }> {
    const { page, limit, status, clientId, search } = opts;
    const where: any = {};

    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [instances, total] = await Promise.all([
      prisma.instance.findMany({
        where,
        include: { client: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.instance.count({ where }),
    ]);

    return { instances: instances as InstanceSnapshot[], total };
  }

  // ----------------------------------------------------------
  // getLiveInstanceStatuses — for SSE stream
  // Returns current status of all instances from DB
  // ----------------------------------------------------------
  async getLiveInstanceStatuses(): Promise<InstanceSnapshot[]> {
    const instances = await prisma.instance.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        connectionType: true,
        phoneNumber: true,
        lastSeen: true,
        createdAt: true,
        client: { select: { id: true, name: true, email: true } },
      },
      orderBy: { name: 'asc' },
    });
    return instances as InstanceSnapshot[];
  }

  // ----------------------------------------------------------
  // PRIVATE: checkDatabase
  // ----------------------------------------------------------
  private async checkDatabase(): Promise<HealthStatus['database']> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error: any) {
      logger.error('Admin health: DB check failed', { error: error.message });
      return { status: 'error', latencyMs: null, error: error.message };
    }
  }

  // ----------------------------------------------------------
  // PRIVATE: checkEvolutionApi
  // ----------------------------------------------------------
  private async checkEvolutionApi(): Promise<HealthStatus['evolutionApi']> {
    const start = Date.now();
    try {
      await evolutionApi.getInstance().get('/instance/fetchInstances');
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error: any) {
      // Evolution API returns 401 if key is wrong — still means it's reachable
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return { status: 'ok', latencyMs: Date.now() - start };
      }
      logger.error('Admin health: Evolution API check failed', { error: error.message });
      return {
        status: 'error',
        latencyMs: null,
        error: axios.isAxiosError(error)
          ? `HTTP ${error.response?.status ?? 'unreachable'}`
          : error.message,
      };
    }
  }
}

export const adminService = new AdminService();
export default adminService;
