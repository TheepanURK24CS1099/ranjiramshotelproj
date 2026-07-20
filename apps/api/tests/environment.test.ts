import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/config/environment.js";

describe("environment parsing", () => {
  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["yes", true],
    ["on", true],
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["no", false],
    ["off", false],
  ])("parses TRUST_PROXY=%s as %s", (value, expected) => {
    expect(parseEnvironment({ TRUST_PROXY: value }).TRUST_PROXY).toBe(expected);
  });

  it.each(["enabled", "disabled", "2", 1])("rejects invalid TRUST_PROXY=%j", (value) => {
    expect(() => parseEnvironment({ TRUST_PROXY: value })).toThrow();
  });

  it.each([3022, "3022"])("accepts API_PORT=%j as an integer", (value) => {
    const port = parseEnvironment({ API_PORT: value }).API_PORT;

    expect(port).toBe(3022);
    expect(Number.isInteger(port)).toBe(true);
  });

  it.each([0, 65_536, 70_000, -1, 3.5, "abc", ""])("rejects API_PORT=%j", (value) => {
    expect(() => parseEnvironment({ API_PORT: value })).toThrow();
  });

  it("uses the API port default only when the value is absent", () => {
    expect(parseEnvironment({}).API_PORT).toBe(3022);
  });
});

describe("database URL validation", () => {
  it.each([
    "postgresql://127.0.0.1:5432/hotel_management",
    "postgresql://localhost:5432/mydb",
    "postgres://user:pass@host:5432/dbname",
    "postgresql://host/db",
  ])("accepts valid DATABASE_URL=%s", (url) => {
    const env = parseEnvironment({ DATABASE_URL: url });
    expect(env.DATABASE_URL).toBe(url);
  });

  it("rejects empty string", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "" })).toThrow();
  });

  it("rejects whitespace-only string", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "   " })).toThrow();
  });

  it("rejects invalid protocol", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "mysql://localhost:5432/db" })).toThrow();
  });

  it("rejects URL without database name", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "postgresql://localhost:5432" })).toThrow();
  });

  it("rejects URL with only slash as database", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "postgresql://localhost/" })).toThrow();
  });

  it("does not expose credentials in error messages", () => {
    const url = "invalid://user:secretpassword123@localhost/db";
    expect(() => parseEnvironment({ DATABASE_URL: url })).toThrow(/^[^]*(?!secretpassword123)$/);
  });

  it("uses the default DATABASE_URL when it is missing", () => {
    const env = parseEnvironment({});
    expect(env.DATABASE_URL).toBe("postgresql://127.0.0.1:5432/hotel_management");
  });
});

describe("database pool configuration", () => {
  it.each([1, 10, 25, 50])("accepts valid DB_POOL_MAX=%j", (value) => {
    const env = parseEnvironment({ DB_POOL_MAX: value });
    expect(env.DB_POOL_MAX).toBe(value);
  });

  it.each(["1", "10", "50"])("accepts string DB_POOL_MAX=%s as integer", (value) => {
    const env = parseEnvironment({ DB_POOL_MAX: value });
    expect(Number.isInteger(env.DB_POOL_MAX)).toBe(true);
  });

  it("defaults DB_POOL_MAX to 10", () => {
    const env = parseEnvironment({});
    expect(env.DB_POOL_MAX).toBe(10);
  });

  it.each([0, 51, 100, -1, 3.5, "abc", ""])("rejects invalid DB_POOL_MAX=%j", (value) => {
    expect(() => parseEnvironment({ DB_POOL_MAX: value })).toThrow();
  });
});

describe("database idle timeout configuration", () => {
  it.each([1000, 30_000, 300_000])("accepts valid DB_IDLE_TIMEOUT_MS=%j", (value) => {
    const env = parseEnvironment({ DB_IDLE_TIMEOUT_MS: value });
    expect(env.DB_IDLE_TIMEOUT_MS).toBe(value);
  });

  it.each(["1000", "30000", "300000"])("accepts string DB_IDLE_TIMEOUT_MS=%s as integer", (value) => {
    const env = parseEnvironment({ DB_IDLE_TIMEOUT_MS: value });
    expect(Number.isInteger(env.DB_IDLE_TIMEOUT_MS)).toBe(true);
  });

  it("defaults DB_IDLE_TIMEOUT_MS to 30000", () => {
    const env = parseEnvironment({});
    expect(env.DB_IDLE_TIMEOUT_MS).toBe(30_000);
  });

  it.each([999, 300_001, -1, 3.5, "abc", ""])("rejects invalid DB_IDLE_TIMEOUT_MS=%j", (value) => {
    expect(() => parseEnvironment({ DB_IDLE_TIMEOUT_MS: value })).toThrow();
  });
});

describe("database connection timeout configuration", () => {
  it.each([500, 5000, 60_000])("accepts valid DB_CONNECTION_TIMEOUT_MS=%j", (value) => {
    const env = parseEnvironment({ DB_CONNECTION_TIMEOUT_MS: value });
    expect(env.DB_CONNECTION_TIMEOUT_MS).toBe(value);
  });

  it.each(["500", "5000", "60000"])("accepts string DB_CONNECTION_TIMEOUT_MS=%s as integer", (value) => {
    const env = parseEnvironment({ DB_CONNECTION_TIMEOUT_MS: value });
    expect(Number.isInteger(env.DB_CONNECTION_TIMEOUT_MS)).toBe(true);
  });

  it("defaults DB_CONNECTION_TIMEOUT_MS to 5000", () => {
    const env = parseEnvironment({});
    expect(env.DB_CONNECTION_TIMEOUT_MS).toBe(5000);
  });

  it.each([499, 60_001, -1, 3.5, "abc", ""])("rejects invalid DB_CONNECTION_TIMEOUT_MS=%j", (value) => {
    expect(() => parseEnvironment({ DB_CONNECTION_TIMEOUT_MS: value })).toThrow();
  });
});

describe("database statement timeout configuration", () => {
  it.each([1000, 10_000, 300_000])("accepts valid DB_STATEMENT_TIMEOUT_MS=%j", (value) => {
    const env = parseEnvironment({ DB_STATEMENT_TIMEOUT_MS: value });
    expect(env.DB_STATEMENT_TIMEOUT_MS).toBe(value);
  });

  it.each(["1000", "10000", "300000"])("accepts string DB_STATEMENT_TIMEOUT_MS=%s as integer", (value) => {
    const env = parseEnvironment({ DB_STATEMENT_TIMEOUT_MS: value });
    expect(Number.isInteger(env.DB_STATEMENT_TIMEOUT_MS)).toBe(true);
  });

  it("defaults DB_STATEMENT_TIMEOUT_MS to 10000", () => {
    const env = parseEnvironment({});
    expect(env.DB_STATEMENT_TIMEOUT_MS).toBe(10_000);
  });

  it.each([999, 300_001, -1, 3.5, "abc", ""])("rejects invalid DB_STATEMENT_TIMEOUT_MS=%j", (value) => {
    expect(() => parseEnvironment({ DB_STATEMENT_TIMEOUT_MS: value })).toThrow();
  });
});

describe("database SSL configuration", () => {
  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["yes", true],
    ["on", true],
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["no", false],
    ["off", false],
  ])("parses DB_SSL=%s as %s", (value, expected) => {
    expect(parseEnvironment({ DB_SSL: value }).DB_SSL).toBe(expected);
  });

  it("defaults DB_SSL to false", () => {
    const env = parseEnvironment({});
    expect(env.DB_SSL).toBe(false);
  });

  it.each(["enabled", "disabled", "2", 1])("rejects invalid DB_SSL=%j", (value) => {
    expect(() => parseEnvironment({ DB_SSL: value })).toThrow();
  });
});

describe("database SSL reject unauthorized configuration", () => {
  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["yes", true],
    ["on", true],
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["no", false],
    ["off", false],
  ])("parses DB_SSL_REJECT_UNAUTHORIZED=%s as %s", (value, expected) => {
    expect(parseEnvironment({ DB_SSL_REJECT_UNAUTHORIZED: value }).DB_SSL_REJECT_UNAUTHORIZED).toBe(expected);
  });

  it("defaults DB_SSL_REJECT_UNAUTHORIZED to true", () => {
    const env = parseEnvironment({});
    expect(env.DB_SSL_REJECT_UNAUTHORIZED).toBe(true);
  });

  it.each(["enabled", "disabled", "2", 1])("rejects invalid DB_SSL_REJECT_UNAUTHORIZED=%j", (value) => {
    expect(() => parseEnvironment({ DB_SSL_REJECT_UNAUTHORIZED: value })).toThrow();
  });
});
