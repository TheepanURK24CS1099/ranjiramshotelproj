import { Pool, type PoolClient } from "pg";

import { env } from "../../config/environment.js";
import { logger } from "../../config/logger.js";
import type { DatabasePoolConfig } from "./database.types.js";

let databasePool: Pool | undefined;

function createDatabasePoolConfig(): DatabasePoolConfig {
  return {
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
    application_name: "hotel-api",
    ssl: env.DB_SSL ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED } : false,
  };
}

function getDatabasePool(): Pool {
  if (databasePool === undefined) {
    databasePool = new Pool(createDatabasePoolConfig());

    databasePool.on("error", (error) => {
      logger.error(
        {
          err: {
            message: error.message,
            code: (error as Error & { code?: string }).code,
          },
        },
        "Unexpected PostgreSQL pool error",
      );
    });
  }

  return databasePool;
}

export async function checkDatabaseConnection(): Promise<void> {
  const pool = getDatabasePool();
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    const result = await client.query<{ ok: number }>("SELECT 1 AS ok");

    if (result.rows[0]?.ok !== 1) {
      throw new Error("Database health check returned an unexpected result");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown database error";
    throw new Error(`Database connection check failed: ${message}`);
  } finally {
    client?.release();
  }
}

export async function closeDatabasePool(): Promise<void> {
  if (databasePool === undefined) {
    return;
  }

  const pool = databasePool;
  databasePool = undefined;

  try {
    await pool.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown database error";
    logger.error({ err: { message } }, "Failed to close PostgreSQL pool safely");
  }
}
