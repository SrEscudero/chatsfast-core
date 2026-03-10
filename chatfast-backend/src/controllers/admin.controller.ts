import { Request, Response, NextFunction } from 'express';
import { adminService } from '../services/admin.service';
import { ApiResponder } from '../utils/apiResponse';
import { logger, onLog, offLog } from '../config/logger';

// ============================================================
// SSE HELPERS
// ============================================================

/** Active SSE connections for /admin/instances/live */
const liveClients = new Set<Response>();

/**
 * Broadcast a JSON payload to all connected SSE clients in a set.
 */
function broadcast(clients: Set<Response>, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

// ============================================================
// CONTROLLER
// ============================================================

class AdminController {

  // ----------------------------------------------------------
  // GET /api/v1/admin/overview
  // ----------------------------------------------------------
  async getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await adminService.getOverview();
      ApiResponder.success(res, stats, 'Overview obtenido exitosamente');
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/admin/health
  // ----------------------------------------------------------
  async getHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const health = await adminService.getHealth();
      const httpStatus = health.overall === 'unhealthy' ? 503 : 200;
      res.status(httpStatus).json({
        success: true,
        data: health,
        message: `Sistema ${health.overall}`,
      });
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/admin/instances
  // ----------------------------------------------------------
  async getInstances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Helper: Express query params son string | string[] | undefined
      const qs = (key: string, def?: string): string | undefined => {
        const v = req.query[key];
        if (Array.isArray(v)) return v[0] as string;
        return (v as string | undefined) ?? def;
      };

      const page     = qs('page', '1')!;
      const limit    = qs('limit', '20')!;
      const status   = qs('status');
      const clientId = qs('clientId');
      const search   = qs('search');

      const parsedPage = parseInt(page);
      const parsedLimit = parseInt(limit);

      const { instances, total } = await adminService.getAllInstances({
        page: parsedPage,
        limit: parsedLimit,
        status,
        clientId,
        search,
      });

      ApiResponder.success(res, {
        items: instances,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.ceil(total / parsedLimit),
          hasNextPage: parsedPage < Math.ceil(total / parsedLimit),
          hasPrevPage: parsedPage > 1,
        },
      }, 'Instancias obtenidas exitosamente');
    } catch (error) {
      next(error);
    }
  }

  // ----------------------------------------------------------
  // GET /api/v1/admin/instances/live  — SSE stream
  // Pushes instance status snapshot every 5 seconds
  // ----------------------------------------------------------
  async liveInstances(req: Request, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    liveClients.add(res);
    logger.debug('SSE client connected to /admin/instances/live', { total: liveClients.size });

    // Send initial snapshot immediately
    const sendSnapshot = async () => {
      try {
        const instances = await adminService.getLiveInstanceStatuses();
        broadcast(liveClients, 'snapshot', { instances, timestamp: new Date().toISOString() });
      } catch (err) {
        logger.error('SSE snapshot error', { err });
      }
    };

    await sendSnapshot();

    // Send heartbeat + snapshot every 5 seconds
    const interval = setInterval(async () => {
      res.write(': heartbeat\n\n'); // SSE comment = keepalive
      await sendSnapshot();
    }, 5000);

    // Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(interval);
      liveClients.delete(res);
      logger.debug('SSE client disconnected from /admin/instances/live', { total: liveClients.size });
    });
  }

  // ----------------------------------------------------------
  // GET /api/v1/admin/logs  — SSE stream of live server logs
  // ----------------------------------------------------------
  async liveLogs(req: Request, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Log stream iniciado', timestamp: new Date().toISOString() })}\n\n`);

    // Register listener — each log entry from Winston is forwarded to this client
    const listener = (entry: { level: string; message: string; timestamp: string }) => {
      try {
        res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
      } catch { /* client disconnected */ }
    };
    onLog(listener);

    logger.info('SSE client connected to /admin/logs');

    // Heartbeat every 30 seconds
    const interval = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(interval);
        offLog(listener);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(interval);
      offLog(listener);
      logger.debug('SSE client disconnected from /admin/logs');
    });
  }
}

export const adminController = new AdminController();
export default adminController;
