import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { env } from "../src/config/environment.js";

describe("migrations configuration", () => {
  it("validates DATABASE_URL targets hotel_management", () => {
    expect(env.DATABASE_URL).toContain("hotel_management");
    expect(env.DATABASE_URL.startsWith("postgres:") || env.DATABASE_URL.startsWith("postgresql:")).toBe(true);
  });

  it("has migration runner script and migrations folder", () => {
    const migrationsDir = path.resolve(process.cwd(), "migrations");
    const runner = path.resolve(process.cwd(), "src/scripts/migrate.ts");

    expect(fs.existsSync(runner)).toBe(true);
    const files = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir) : [];
    expect(files.length).toBeGreaterThan(0);
  });
});
