import { createServer, type Server } from "node:http";

import app from "./app.js";
import { env } from "./config/environment.js";
import { logger } from "./config/logger.js";

const serviceName = "hotel-api";

let server: Server | undefined;
let shuttingDown = false;

function closeServer(currentServer: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    currentServer.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  try {
    if (server !== undefined) {
      await closeServer(server);
    }

    logger.info({ service: serviceName, reason }, "API shutdown complete");
    process.exit(exitCode);
  } catch (shutdownError) {
    logger.error({ err: shutdownError, reason }, "API shutdown failed");
    process.exit(exitCode);
  }
}

function startServer(): void {
  server = createServer(app);

  server.once("error", (error) => {
    logger.fatal(
      {
        err: error,
        service: serviceName,
        host: env.API_HOST,
        port: env.API_PORT,
        environment: env.NODE_ENV,
      },
      "API startup failed",
    );
    process.exit(1);
  });

  server.listen(env.API_PORT, env.API_HOST, () => {
    logger.info(
      {
        service: serviceName,
        host: env.API_HOST,
        port: env.API_PORT,
        environment: env.NODE_ENV,
      },
      "API server started",
    );
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT", 0);
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM", 0);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});

startServer();
