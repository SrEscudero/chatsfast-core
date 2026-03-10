import * as si from 'systeminformation';
import Dockerode from 'dockerode';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';
import { prisma } from '../config/database';
import { evolutionApi } from '../config/evolution';

// ============================================================
// DOCKER CLIENT
// ============================================================

let docker: Dockerode | null = null;

function getDocker(): Dockerode {
  if (!docker) {
    // On Windows use named pipe; on Linux/Mac use socket
    docker = process.platform === 'win32'
      ? new Dockerode({ socketPath: '//./pipe/docker_engine' })
      : new Dockerode({ socketPath: '/var/run/docker.sock' });
  }
  return docker;
}

// ============================================================
// TYPES
// ============================================================

export interface SystemMetrics {
  cpu: {
    manufacturer: string;
    brand: string;
    speed: number;
    cores: number;
    physicalCores: number;
    usagePercent: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
    totalGb: number;
    usedGb: number;
    freeGb: number;
  };
  disk: Array<{
    mount: string;
    type: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
    totalGb: number;
    freeGb: number;
  }>;
  os: {
    platform: string;
    distro: string;
    release: string;
    hostname: string;
    uptime: number;
    uptimeFormatted: string;
  };
  timestamp: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: number;
  ports: Array<{ privatePort: number; publicPort?: number; type: string }>;
  cpu?: number;
  memoryMb?: number;
}

// ============================================================
// HELPERS
// ============================================================

function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// ============================================================
// SERVICE
// ============================================================

// Cache static system info (CPU brand, OS, etc.) — these don't change
let cachedStaticInfo: { cpu: Awaited<ReturnType<typeof si.cpu>>; os: Awaited<ReturnType<typeof si.osInfo>> } | null = null;

class InfraService {

  // ----------------------------------------------------------
  // getHealthStatus — ping DB, Evolution API, Docker
  // ----------------------------------------------------------
  async getHealthStatus(): Promise<{
    services: Array<{ name: string; status: 'ok' | 'error'; latencyMs: number; error?: string }>;
    overall: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
      ]);

    const checks = await Promise.all([
      // Database
      (async () => {
        const start = Date.now();
        try {
          await withTimeout(prisma.$queryRaw`SELECT 1`, 3000);
          return { name: 'PostgreSQL', status: 'ok' as const, latencyMs: Date.now() - start };
        } catch (err: any) {
          return { name: 'PostgreSQL', status: 'error' as const, latencyMs: Date.now() - start, error: err.message };
        }
      })(),
      // Evolution API
      (async () => {
        const start = Date.now();
        try {
          await withTimeout(evolutionApi.getInstance().get('/', { timeout: 3000 }), 3000);
          return { name: 'Evolution API', status: 'ok' as const, latencyMs: Date.now() - start };
        } catch (err: any) {
          return { name: 'Evolution API', status: 'error' as const, latencyMs: Date.now() - start, error: err.message };
        }
      })(),
      // Docker
      (async () => {
        const start = Date.now();
        try {
          await withTimeout(getDocker().ping(), 3000);
          return { name: 'Docker', status: 'ok' as const, latencyMs: Date.now() - start };
        } catch (err: any) {
          return { name: 'Docker', status: 'error' as const, latencyMs: Date.now() - start, error: err.message };
        }
      })(),
    ]);

    const failCount = checks.filter(c => c.status === 'error').length;
    const overall = failCount === 0 ? 'healthy' : failCount < checks.length ? 'degraded' : 'unhealthy';

    return { services: checks, overall };
  }

  // ----------------------------------------------------------
  // getSystemMetrics — CPU, RAM, Disk, OS
  // ----------------------------------------------------------
  async getSystemMetrics(): Promise<SystemMetrics> {
    // Cache static info (CPU specs, OS) — only fetch once
    if (!cachedStaticInfo) {
      const [cpu, os] = await Promise.all([si.cpu(), si.osInfo()]);
      cachedStaticInfo = { cpu, os };
    }

    const [cpuLoad, mem, fsSize] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
    ]);
    const cpuData = cachedStaticInfo.cpu;
    const osInfo = cachedStaticInfo.os;

    const relevantDisks = fsSize.filter(
      (fs) => fs.size > 0 && !fs.fs.startsWith('tmpfs') && !fs.fs.startsWith('devtmpfs'),
    );

    return {
      cpu: {
        manufacturer: cpuData.manufacturer,
        brand: cpuData.brand,
        speed: cpuData.speed,
        cores: cpuData.cores,
        physicalCores: cpuData.physicalCores,
        usagePercent: Math.round(cpuLoad.currentLoad * 10) / 10,
      },
      memory: {
        totalBytes: mem.total,
        usedBytes: mem.active,
        freeBytes: mem.available,
        usagePercent: Math.round((mem.active / mem.total) * 1000) / 10,
        totalGb: bytesToGb(mem.total),
        usedGb: bytesToGb(mem.active),
        freeGb: bytesToGb(mem.available),
      },
      disk: relevantDisks.map((fs) => ({
        mount: fs.mount,
        type: fs.type,
        totalBytes: fs.size,
        usedBytes: fs.used,
        freeBytes: fs.size - fs.used,
        usagePercent: Math.round(fs.use * 10) / 10,
        totalGb: bytesToGb(fs.size),
        freeGb: bytesToGb(fs.size - fs.used),
      })),
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        hostname: osInfo.hostname,
        uptime: si.time().uptime,
        uptimeFormatted: formatUptime(si.time().uptime),
      },
      timestamp: new Date().toISOString(),
    };
  }

  // ----------------------------------------------------------
  // getContainers — list all Docker containers
  // ----------------------------------------------------------
  async getContainers(all = true): Promise<ContainerInfo[]> {
    try {
      const containers = await getDocker().listContainers({ all });
      return containers.map((c) => ({
        id: c.Id.slice(0, 12),
        name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
        image: c.Image,
        status: c.Status,
        state: c.State,
        created: c.Created,
        ports: (c.Ports ?? []).map((p) => ({
          privatePort: p.PrivatePort,
          publicPort: p.PublicPort,
          type: p.Type,
        })),
      }));
    } catch (error: any) {
      logger.error('Docker listContainers failed', { error: error.message });
      throw AppError.internal('Docker no disponible: ' + error.message);
    }
  }

  // ----------------------------------------------------------
  // getContainerById — inspect a single container
  // ----------------------------------------------------------
  async getContainerById(id: string): Promise<ContainerInfo> {
    try {
      const container = getDocker().getContainer(id);
      const info = await container.inspect();
      return {
        id: info.Id.slice(0, 12),
        name: info.Name.replace(/^\//, ''),
        image: info.Config.Image,
        status: info.State.Status,
        state: info.State.Status,
        created: new Date(info.Created).getTime() / 1000,
        ports: Object.entries(info.NetworkSettings.Ports ?? {}).flatMap(([key, bindings]) => {
          const [privatePort, type] = key.split('/');
          return (bindings ?? []).map((b: any) => ({
            privatePort: parseInt(privatePort),
            publicPort: parseInt(b.HostPort),
            type,
          }));
        }),
      };
    } catch (error: any) {
      if (error.statusCode === 404) throw AppError.notFound('Contenedor no encontrado');
      throw AppError.internal('Docker error: ' + error.message);
    }
  }

  // ----------------------------------------------------------
  // restartContainer
  // ----------------------------------------------------------
  async restartContainer(id: string): Promise<void> {
    try {
      const container = getDocker().getContainer(id);
      await container.restart({ t: 10 }); // 10s grace period
      logger.info('Container restarted', { id });
    } catch (error: any) {
      if (error.statusCode === 404) throw AppError.notFound('Contenedor no encontrado');
      throw AppError.internal('No se pudo reiniciar el contenedor: ' + error.message);
    }
  }

  // ----------------------------------------------------------
  // stopContainer
  // ----------------------------------------------------------
  async stopContainer(id: string): Promise<void> {
    try {
      const container = getDocker().getContainer(id);
      await container.stop({ t: 10 });
      logger.info('Container stopped', { id });
    } catch (error: any) {
      if (error.statusCode === 404) throw AppError.notFound('Contenedor no encontrado');
      if (error.statusCode === 304) return; // already stopped
      throw AppError.internal('No se pudo detener el contenedor: ' + error.message);
    }
  }

  // ----------------------------------------------------------
  // startContainer
  // ----------------------------------------------------------
  async startContainer(id: string): Promise<void> {
    try {
      const container = getDocker().getContainer(id);
      await container.start();
      logger.info('Container started', { id });
    } catch (error: any) {
      if (error.statusCode === 404) throw AppError.notFound('Contenedor no encontrado');
      if (error.statusCode === 304) return; // already running
      throw AppError.internal('No se pudo iniciar el contenedor: ' + error.message);
    }
  }

  // ----------------------------------------------------------
  // pruneContainers — remove stopped/exited containers
  // ----------------------------------------------------------
  async pruneContainers(): Promise<{ removed: string[]; spaceReclaimedMb: number }> {
    try {
      const result = await getDocker().pruneContainers();
      return {
        removed:           result.ContainersDeleted ?? [],
        spaceReclaimedMb:  Math.round((result.SpaceReclaimed ?? 0) / 1024 / 1024 * 100) / 100,
      };
    } catch (error: any) {
      throw AppError.internal('No se pudo limpiar contenedores: ' + error.message);
    }
  }

  // ----------------------------------------------------------
  // getContainerDetail — full inspect with env, mounts, network
  // ----------------------------------------------------------
  async getContainerDetail(id: string): Promise<Record<string, unknown>> {
    try {
      const container = getDocker().getContainer(id);
      const info = await container.inspect();
      const networks = info.NetworkSettings?.Networks ?? {};
      const firstNet = Object.values(networks)[0] as any;
      return {
        id:           info.Id.slice(0, 12),
        name:         info.Name.replace(/^\//, ''),
        image:        info.Config?.Image ?? '',
        state:        info.State?.Status ?? 'unknown',
        running:      info.State?.Running ?? false,
        startedAt:    info.State?.StartedAt ?? null,
        created:      info.Created,
        restartCount: info.RestartCount ?? 0,
        platform:     info.Platform ?? 'linux',
        cmd:          info.Config?.Cmd ?? [],
        entrypoint:   info.Config?.Entrypoint ?? [],
        env:          (info.Config?.Env ?? []).filter((e: string) => !e.toLowerCase().includes('password') && !e.toLowerCase().includes('secret') && !e.toLowerCase().includes('key')),
        mounts:       (info.Mounts ?? []).map((m: any) => ({ type: m.Type, source: m.Source, destination: m.Destination, mode: m.Mode })),
        networks:     Object.keys(networks),
        ipAddress:    firstNet?.IPAddress ?? null,
        ports:        Object.entries(info.NetworkSettings?.Ports ?? {}).flatMap(([key, bindings]: [string, any]) => {
          const [privatePort, type] = key.split('/');
          return (bindings ?? []).map((b: any) => ({ privatePort: parseInt(privatePort), publicPort: parseInt(b.HostPort), type }));
        }),
      };
    } catch (error: any) {
      if (error.statusCode === 404) throw AppError.notFound('Contenedor no encontrado');
      throw AppError.internal('Docker error: ' + error.message);
    }
  }

  // ----------------------------------------------------------
  // getTopProcesses — top 15 by CPU usage
  // ----------------------------------------------------------
  async getTopProcesses(): Promise<Array<{ pid: number; name: string; cpu: number; memMb: number; state: string; user: string }>> {
    const procs = await si.processes();
    return procs.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 15)
      .map(p => ({
        pid:   p.pid,
        name:  p.name,
        cpu:   Math.round(p.cpu   * 10) / 10,
        memMb: Math.round((p.mem_rss ?? 0) / 1024 / 1024 * 10) / 10,
        state: p.state ?? '?',
        user:  p.user  ?? '?',
      }));
  }

  // ----------------------------------------------------------
  // getNetworkStats — RX/TX per interface
  // ----------------------------------------------------------
  async getNetworkStats(): Promise<Array<{ iface: string; rxMb: number; txMb: number; rxSec: number; txSec: number }>> {
    const nets = await si.networkStats();
    return nets
      .filter(n => n.iface && n.rx_bytes !== undefined)
      .map(n => ({
        iface: n.iface,
        rxMb:  Math.round(n.rx_bytes  / 1024 / 1024 * 100) / 100,
        txMb:  Math.round(n.tx_bytes  / 1024 / 1024 * 100) / 100,
        rxSec: Math.round((n.rx_sec   ?? 0) / 1024),
        txSec: Math.round((n.tx_sec   ?? 0) / 1024),
      }));
  }

  // ----------------------------------------------------------
  // streamContainerLogs — returns a readable stream for SSE
  // ----------------------------------------------------------
  async getContainerLogStream(id: string): Promise<NodeJS.ReadableStream> {
    try {
      const container = getDocker().getContainer(id);
      // tail=100 gives last 100 lines on connect, then follow=1 for live
      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail: 100,
        timestamps: true,
      });
      return stream as unknown as NodeJS.ReadableStream;
    } catch (error: any) {
      if (error.statusCode === 404) throw AppError.notFound('Contenedor no encontrado');
      throw AppError.internal('No se pudo obtener logs del contenedor: ' + error.message);
    }
  }
}

export const infraService = new InfraService();
export default infraService;
