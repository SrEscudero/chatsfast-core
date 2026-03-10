import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './config';
import { logger } from './config/logger';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { rateLimiter } from './middleware/rateLimiter';

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupSwagger();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(helmet({ contentSecurityPolicy: false }));
    // CORS: en development permite cualquier origen localhost.
    // En production usa la lista de CORS_ORIGIN (puede ser URL o * ).
    // IMPORTANTE: credentials:true es incompatible con origin:'*' en browsers modernos,
    // por eso usamos función cuando el origin no está configurado.
    const allowedOrigins = config.CORS_ORIGIN === '*'
      ? null  // null = permitir todo sin credentials
      : config.CORS_ORIGIN.split(',').map(o => o.trim());

    this.app.use(cors({
      origin: (origin, callback) => {
        // Peticiones sin origin (curl, Postman, SSR)
        if (!origin) return callback(null, true);
        // En development, permitir cualquier localhost
        if (config.NODE_ENV === 'development') return callback(null, true);
        // Lista de orígenes permitidos
        if (!allowedOrigins || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        callback(new Error(`CORS: origen no permitido — ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    }));
    this.app.use(requestIdMiddleware);
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(compression());
    this.app.use('/api', rateLimiter);

    this.app.use((req, res, next) => {
      logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        requestId: res.locals.requestId,
      });
      next();
    });
  }

  private setupRoutes(): void {
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
    });
    this.app.use('/api/v1', routes);

    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
      });
    });
  }

  private setupSwagger(): void {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'ChatFast API - Kelvis Tech',
          version: '1.0.0',
          description: 'API centralizada para gestión de instancias de WhatsApp.',
          contact: { name: 'Kelvis Tech', email: 'support@kelvistech.com' },
        },
        servers: [{ url: `http://localhost:${config.PORT}`, description: 'Desarrollo Local' }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Obtén el token con POST /api/v1/auth/login y pégalo aquí.',
            },
          },
        },
        security: [{ bearerAuth: [] }],
      },
      // CAMBIO 2: Agregar messages.routes.ts al scanner de Swagger
      // Sin esta línea, los @swagger de messages.routes.ts no aparecen en /api-docs
      apis: [
        './src/routes/*.ts',       // instances, webhook, messages, index
        './src/controllers/*.ts',  // por si agregas @swagger en controllers
      ],
    };

    const swaggerDocs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
    }));
    logger.info('📖 Swagger docs available at /api-docs');
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }
}

export const app = new App().app;
export default app;