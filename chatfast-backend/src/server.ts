import app from './app';
import { config } from './config';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/database';

const PORT = config.PORT;

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  try {
    await disconnectDatabase();
    logger.info('Database disconnected');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(PORT, () => {
      logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 ChatFast Backend - Kelvis Tech                       ║
║                                                           ║
║   Server running on: http://localhost:${PORT}                ║
║   API Documentation: http://localhost:${PORT}/api-docs       ║
║   Health Check: http://localhost:${PORT}/health              ║
║   Environment: ${config.NODE_ENV}                                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

startServer();