import type { ErrorRequestHandler } from "express";

import { logger } from "../../config/logger.js";
import { AppError } from "../errors/app-error.js";
import { getRequestId } from "./request-id.js";

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (response.headersSent) {
    return _next(error);
  }

  const requestId = getRequestId(request);

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.safeMessage,
        requestId,
      },
    });
    return;
  }

  logger.error({ err: error, requestId }, "Unexpected application error");

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      requestId,
    },
  });
};
