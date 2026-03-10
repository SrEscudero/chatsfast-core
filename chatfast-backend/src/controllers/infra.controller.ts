import { Request, Response, NextFunction } from 'express';
import { infraService } from '../services/infra.service';
import { ApiResponder } from '../utils/apiResponse';
import { logger } from '../config/logger';

class InfraController {

  // ----------------------------------------------------------
  // GET /api/v1/infra/health
  // ----------------------------------------------------------
  async getHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const health = await infraService.getHealthStatus();
      ApiResponder.success(res, health, 'Estado de servicios obtenido');
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/infra/metrics
  // ----------------------------------------------------------
  async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await infraService.getSystemMetrics();
      ApiResponder.success(res, metrics, 'Métricas del sistema obtenidas');
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/infra/containers
  // ----------------------------------------------------------
  async getContainers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const all = req.query.all !== 'false'; // default: include stopped containers
      const containers = await infraService.getContainers(all);
      ApiResponder.success(res, { containers, total: containers.length }, 'Contenedores obtenidos');
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/infra/containers/:id
  // ----------------------------------------------------------
  async getContainer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const container = await infraService.getContainerById(req.params.id);
      ApiResponder.success(res, container, 'Contenedor obtenido');
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/infra/containers/:id/restart
  // ----------------------------------------------------------
  async restartContainer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await infraService.restartContainer(req.params.id);
      ApiResponder.success(res, null, `Contenedor ${req.params.id} reiniciado`);
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/infra/containers/:id/stop
  // ----------------------------------------------------------
  async stopContainer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await infraService.stopContainer(req.params.id);
      ApiResponder.success(res, null, `Contenedor ${req.params.id} detenido`);
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/infra/containers/:id/start
  // ----------------------------------------------------------
  async startContainer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await infraService.startContainer(req.params.id);
      ApiResponder.success(res, null, `Contenedor ${req.params.id} iniciado`);
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // POST /api/v1/infra/containers/prune
  // ----------------------------------------------------------
  async pruneContainers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await infraService.pruneContainers();
      ApiResponder.success(res, result, `${result.removed.length} contenedores eliminados, ${result.spaceReclaimedMb} MB liberados`);
    } catch (error) { next(error); }
  }

  // ----------------------------------------------------------
  // GET /api/v1/infra/containers/:id/detail
  // ----------------------------------------------------------
  async getContainerDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const detail = await infraService.getContainerDetail(req.params.id);
      ApiResponder.success(res, detail);
    } catch (error) { next(error); }
  }

  // ----------------------------------------------------------
  // GET /api/v1/infra/processes
  // ----------------------------------------------------------
  async getProcesses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const processes = await infraService.getTopProcesses();
      ApiResponder.success(res, { processes });
    } catch (error) { next(error); }
  }

  // ----------------------------------------------------------
  // GET /api/v1/infra/network
  // ----------------------------------------------------------
  async getNetworkStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const interfaces = await infraService.getNetworkStats();
      ApiResponder.success(res, { interfaces });
    } catch (error) { next(error); }
  }

  // ----------------------------------------------------------
  // GET /api/v1/infra/containers/:id/logs  — SSE
  // ----------------------------------------------------------
  async streamContainerLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const containerId = req.params.id;

    try {
      const logStream = await infraService.getContainerLogStream(containerId);

      // Docker multiplexes stdout/stderr with an 8-byte header.
      // We strip it to get clean text lines.
      logStream.on('data', (chunk: Buffer) => {
        const raw = chunk.toString('utf8');
        // Remove Docker stream header (first 8 bytes of each frame)
        const lines = raw.split('\n').filter(Boolean).map((line) => {
          // Strip the 8-byte binary header if present
          return line.length > 8 && line.charCodeAt(0) < 3
            ? line.slice(8)
            : line;
        });

        for (const line of lines) {
          try {
            res.write(`event: log\ndata: ${JSON.stringify({ message: line, timestamp: new Date().toISOString() })}\n\n`);
          } catch {
            // client disconnected
          }
        }
      });

      logStream.on('end', () => {
        try {
          res.write(`event: end\ndata: ${JSON.stringify({ message: 'Stream finalizado' })}\n\n`);
          res.end();
        } catch { /* ignore */ }
      });

      logStream.on('error', (err) => {
        logger.error('Container log stream error', { containerId, err });
        try {
          res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
          res.end();
        } catch { /* ignore */ }
      });

      // Cleanup on client disconnect
      req.on('close', () => {
        logger.debug('SSE client disconnected from container logs', { containerId });
        (logStream as any).destroy?.();
      });

    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/infra/metrics/live  — SSE stream every 5s
  // ----------------------------------------------------------
  async liveMetrics(req: Request, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = async () => {
      try {
        const metrics = await infraService.getSystemMetrics();
        res.write(`event: metrics\ndata: ${JSON.stringify(metrics)}\n\n`);
      } catch (err) {
        logger.error('SSE metrics error', { err });
      }
    };

    await send();
    const interval = setInterval(async () => {
      res.write(': heartbeat\n\n');
      await send();
    }, 5000);

    req.on('close', () => {
      clearInterval(interval);
      logger.debug('SSE client disconnected from /infra/metrics/live');
    });
  }
}

export const infraController = new InfraController();
export default infraController;
