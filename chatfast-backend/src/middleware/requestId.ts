import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  
  req.headers['x-request-id'] = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

export default requestIdMiddleware;