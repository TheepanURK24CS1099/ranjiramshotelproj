import "dotenv/config";

import { z } from "zod";

const supportedLogLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

const parseInteger = (value: unknown): number | undefined | unknown => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }
  }

  return value;
};

const parseTrustProxy = (value: unknown): boolean | undefined | unknown => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
};

const parseBoolean = (value: unknown): boolean | undefined | unknown => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
};

const validateDatabaseUrl = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("database URL cannot be empty");
  }

  const url = new URL(trimmed);

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("invalid database URL protocol");
  }

  if (!url.pathname || url.pathname === "/") {
    throw new Error("database name is required");
  }

  return trimmed;
};

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.preprocess(parseInteger, z.number().int().min(1).max(65_535).default(3022)),
  WEB_ORIGIN: z.string().url().default("http://localhost:3020"),
  LOG_LEVEL: z.enum(supportedLogLevels).default("info"),
  TRUST_PROXY: z.preprocess(parseTrustProxy, z.boolean().default(false)),
  DATABASE_URL: z.string().trim().transform(validateDatabaseUrl).default("postgresql://127.0.0.1:5432/hotel_management"),
  DB_POOL_MAX: z.preprocess(
    parseInteger,
    z.number().int().min(1).max(50).default(10),
  ),
  DB_IDLE_TIMEOUT_MS: z.preprocess(
    parseInteger,
    z.number().int().min(1000).max(300_000).default(30_000),
  ),
  DB_CONNECTION_TIMEOUT_MS: z.preprocess(
    parseInteger,
    z.number().int().min(500).max(60_000).default(5000),
  ),
  DB_STATEMENT_TIMEOUT_MS: z.preprocess(
    parseInteger,
    z.number().int().min(1000).max(300_000).default(10_000),
  ),
  DB_SSL: z.preprocess(parseBoolean, z.boolean().default(false)),
  DB_SSL_REJECT_UNAUTHORIZED: z.preprocess(parseBoolean, z.boolean().default(true)),
  SESSION_COOKIE_NAME: z.string().default("hotel_session"),
  SESSION_DURATION_MS: z.preprocess(
    parseInteger,
    z.number().int().min(1000).default(24 * 60 * 60 * 1000), // 24 hours
  ),
  MAX_FAILED_ATTEMPTS: z.preprocess(
    parseInteger,
    z.number().int().min(1).default(5),
  ),
  LOCK_DURATION_MS: z.preprocess(
    parseInteger,
    z.number().int().min(1000).default(15 * 60 * 1000), // 15 mins
  ),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.preprocess(
    parseInteger,
    z.number().int().min(1000).default(15 * 60 * 1000), // 15 mins
  ),
  LOGIN_RATE_LIMIT_MAX: z.preprocess(
    parseInteger,
    z.number().int().min(1).default(100), // 100 requests per window
  ),
  DEVICE_OFFLINE_THRESHOLD_MS: z.preprocess(parseInteger, z.number().int().min(1000).default(5 * 60 * 1000)),
  DEVICE_STATUS_CHECK_INTERVAL_MS: z.preprocess(parseInteger, z.number().int().min(1000).default(60 * 1000)),
  ADMS_BODY_LIMIT: z.string().regex(/^\d+(b|kb|mb)$/i).default("64kb"),
  ADMS_TIMEZONE_OFFSET: z.string().regex(/^[+-](0\d|1[0-4]):[0-5]\d$/).default("+05:30"),
});

export function parseEnvironment(input: Record<string, unknown>) {
  return environmentSchema.parse(input);
}

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");

  console.error("Invalid environment configuration.");
  console.error(issues);

  process.exit(1);
}

export const env = result.data;
