import * as si from 'systeminformation';
import Dockerode from 'dockerode';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';

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

class InfraService {

  // ----------------------------------------------------------
  // getSystemMetrics — CPU, RAM, Disk, OS
  // ----------------------------------------------------------
  async getSystemMetrics(): Promise<SystemMetrics> {
    const [cpuData, cpuLoad, mem, fsSize, osInfo] = await Promise.all([
      si.cpu(),
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
    ]);

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
