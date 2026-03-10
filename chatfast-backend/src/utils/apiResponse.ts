import { Response } from 'express';
import { ApiResponse, HttpStatus } from '../types/api.types';

export class ApiResponder {
  static success<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode: HttpStatus = HttpStatus.OK
  ): Response<ApiResponse<T>> {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId || 'unknown',
        version: '1.0.0',
      },
    });
  }

  static error(
    res: Response,
    message: string,
    code: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    details?: any
  ): Response<ApiResponse> {
    return res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId || 'unknown',
        version: '1.0.0',
      },
    });
  }

  static created<T>(res: Response, data: T, message?: string): Response<ApiResponse<T>> {
    return this.success(res, data, message, HttpStatus.CREATED);
  }

  static noContent(res: Response): Response<void> {
    return res.status(HttpStatus.NO_CONTENT).send();
  }
}

export default ApiResponder;