import type { Request, Response } from "express";

import { logger } from "../../config/logger.js";
import { getRequestId } from "../../common/middleware/request-id.js";
import { checkDatabaseConnection } from "../../infrastructure/database/database.js";

export function getHealth(_request: Request, response: Response): void {
  response.status(200).json({
    data: {
      status: "ok",
      service: "hotel-api",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
}

export async function getReady(request: Request, response: Response): Promise<void> {
  const requestId = getRequestId(request);

  try {
    await checkDatabaseConnection();

    response.status(200).json({
      data: {
        status: "ready",
        service: "hotel-api",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(
      {
        err: {
          name: error instanceof Error ? error.name : "UnknownError",
          message: "Database readiness check failed",
        },
        requestId,
      },
      "Database readiness check failed",
    );

    response.status(503).json({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service is not ready",
        requestId,
      },
    });
  }
}
