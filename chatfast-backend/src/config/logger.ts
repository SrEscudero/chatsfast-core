import winston from 'winston';
import Transport from 'winston-transport';
import { config } from './index';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// ─── SSE Broadcast Transport ────────────────────────────────────────────────
// Listeners register/unregister via onLog/offLog. Each log entry is forwarded
// to all registered callbacks so the admin SSE endpoint can stream them.

type LogCallback = (entry: { level: string; message: string; timestamp: string }) => void;

const logListeners = new Set<LogCallback>();

export function onLog(cb: LogCallback): void { logListeners.add(cb); }
export function offLog(cb: LogCallback): void { logListeners.delete(cb); }

class BroadcastTransport extends Transport {
  log(info: any, callback: () => void): void {
    if (logListeners.size > 0) {
      const entry = {
        level: info.level?.replace(/\u001b\[\d+m/g, '') ?? 'info', // strip ANSI colors
        message: info.stack || info.message,
        timestamp: info.timestamp ?? new Date().toISOString(),
      };
      for (const cb of logListeners) {
        try { cb(entry); } catch { /* ignore */ }
      }
    }
    callback();
  }
}

// ─── Logger ─────────────────────────────────────────────────────────────────

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  defaultMeta: { service: 'chatfast-api' },
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new BroadcastTransport(),
  ],
});

export default logger;