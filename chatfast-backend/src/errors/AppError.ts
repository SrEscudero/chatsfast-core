// ============================================================
// AppError — Clase base para errores de aplicación tipados
//
// Por qué importa:
//   - Lanzar `{ code, message }` como objeto plano no tiene stack trace.
//   - El errorHandler de Express no puede distinguir errores de app
//     vs errores inesperados si todo llega como `unknown`.
//   - Con una clase tipada, el errorHandler hace `instanceof AppError`
//     y decide el status HTTP correcto.
// ============================================================

export type ErrorCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'INSTANCE_DISCONNECTED'
  | 'EVOLUTION_API_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean; // true = error esperado, false = bug

  constructor(code: ErrorCode, message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Necesario para que `instanceof AppError` funcione correctamente
    // cuando TypeScript compila a ES5
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  // Factory methods para los casos más comunes — evitan repetir statusCode
  static notFound(entity: string): AppError {
    return new AppError('NOT_FOUND', `${entity} no encontrado`, 404);
  }

  static instanceDisconnected(name: string): AppError {
    return new AppError(
      'INSTANCE_DISCONNECTED',
      `La instancia "${name}" no está conectada. Reconéctala antes de enviar mensajes.`,
      409
    );
  }

  static evolutionError(message: string): AppError {
    return new AppError('EVOLUTION_API_ERROR', message, 502);
  }
}