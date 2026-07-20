#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

import { env } from "../config/environment.js";

type MigrationStatusRow = Record<string, unknown>;

function resolveMigrationsDir(): string {
  return path.resolve(process.cwd(), "migrations");
}

function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "[REDACTED]";
    parsed.password = "[REDACTED]";
    return parsed.toString();
  } catch {
    return "[REDACTED]";
  }
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await fs.readdir(resolveMigrationsDir(), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(cjs|js|mjs|ts|sql)$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function showStatus(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL, application_name: "hotel-api-migrate" });

  try {
    const migrationFiles = await listMigrationFiles();
    const tableExists = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = $1
      ) AS exists`,
      ["schema_migrations"],
    );

    if (!tableExists.rows[0]?.exists) {
      console.log("schema_migrations: not created yet");
      console.log(`migration files: ${migrationFiles.length === 0 ? "none" : migrationFiles.join(", ")}`);
      return;
    }

    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'schema_migrations'
       ORDER BY ordinal_position`,
    );

    const preferredColumns = ["name", "filename", "migration", "version", "id"];
    const selectColumn = preferredColumns.find((column) => columns.rows.some((row) => row.column_name === column)) ?? columns.rows[0]?.column_name;

    const rows = await pool.query<MigrationStatusRow>(
      selectColumn ? `SELECT ${selectColumn} AS value FROM schema_migrations ORDER BY 1 ASC` : `SELECT * FROM schema_migrations`,
    );

    const applied = rows.rows.map((row) => String(row.value ?? row.name ?? row.filename ?? row.migration ?? row.version ?? row.id ?? JSON.stringify(row)));

    console.log(`schema_migrations: ${applied.length} applied`);
    console.log(`applied migrations: ${applied.length === 0 ? "none" : applied.join(", ")}`);
    console.log(`migration files: ${migrationFiles.length === 0 ? "none" : migrationFiles.join(", ")}`);
  } finally {
    await pool.end();
  }
}

function runNodePgMigrate(action: "up" | "down", count?: number): number {
  const migrationsDir = resolveMigrationsDir();
  const args = ["exec", "node-pg-migrate", action, "-m", migrationsDir, "-t", "schema_migrations", "--single-transaction"];

  if (action === "down" && count !== undefined) {
    args.push(String(count));
  }

  console.log(`Running migration '${action}' against ${redactDatabaseUrl(env.DATABASE_URL)}`);

  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
  });

  if (result.error) {
    console.error("Migration failed");
    throw result.error;
  }

  return result.status ?? 1;
}

export async function main(): Promise<void> {
  const [command = "up", rawCount] = process.argv.slice(2);

  if (command === "status") {
    await showStatus();
    return;
  }

  if (command !== "up" && command !== "down") {
    console.error("Invalid command. Use up, down, or status.");
    process.exitCode = 1;
    return;
  }

  const count = rawCount === undefined ? undefined : Number(rawCount);
    if (count === undefined || !Number.isInteger(count) || count <= 0) {
      if (rawCount === undefined) {
        // no count is valid for up/down, but only after this branch is skipped
      } else {
        console.error("Migration count must be a positive integer.");
        process.exitCode = 1;
        return;
      }
    }

  const exitCode = runNodePgMigrate(command, count);
  if (exitCode !== 0) {
    console.error(`node-pg-migrate exited with status ${exitCode}`);
    process.exitCode = exitCode;
    return;
  }

  console.log("Migration completed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
