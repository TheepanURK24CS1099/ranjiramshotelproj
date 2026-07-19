import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const requestId = randomUUID();
  request.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}

export function getRequestId(request: Request): string {
  return request.requestId;
}

export {};
