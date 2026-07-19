import type { Request } from "express";

import pino, { type LoggerOptions } from "pino";
import { pinoHttp } from "pino-http";

import { getRequestId } from "../common/middleware/request-id.js";
import { env } from "./environment.js";

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "authorization",
      "cookie",
      "password",
      "token",
      "secret",
    ],
    remove: true,
  },
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
};

export const logger = pino(loggerOptions);

export const requestLogger = pinoHttp({
  logger,
  genReqId: (request: Request) => getRequestId(request),
  customProps: (request: Request) => ({
    requestId: getRequestId(request),
  }),
});
