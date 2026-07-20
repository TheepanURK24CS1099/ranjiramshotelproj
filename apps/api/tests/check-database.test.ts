import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkDatabaseConnectionMock, closeDatabasePoolMock } = vi.hoisted(() => ({
  checkDatabaseConnectionMock: vi.fn(),
  closeDatabasePoolMock: vi.fn(),
}));

vi.mock("../src/infrastructure/database/database.js", () => ({
  checkDatabaseConnection: checkDatabaseConnectionMock,
  closeDatabasePool: closeDatabasePoolMock,
}));

import { main as runDatabaseCheck } from "../src/scripts/check-database.js";

describe("database check script", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.exitCode = undefined;
  });

  it("exits successfully when the database connection is reachable", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    checkDatabaseConnectionMock.mockResolvedValue(undefined);
    closeDatabasePoolMock.mockResolvedValue(undefined);

    await runDatabaseCheck();

    expect(consoleLogSpy).toHaveBeenCalledWith("Database connection check succeeded");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(closeDatabasePoolMock).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  it("sets a failure exit code when the database connection check fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    checkDatabaseConnectionMock.mockRejectedValue(new Error("database exploded"));
    closeDatabasePoolMock.mockResolvedValue(undefined);

    await runDatabaseCheck();

    expect(consoleErrorSpy).toHaveBeenCalledWith("Database connection check failed");
    expect(closeDatabasePoolMock).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  it("does not print database internals on failure", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    checkDatabaseConnectionMock.mockRejectedValue(new Error("database exploded"));
    closeDatabasePoolMock.mockResolvedValue(undefined);

    await runDatabaseCheck();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Database connection check failed");
  });

  it("closes the pool on both success and failure", async () => {
    checkDatabaseConnectionMock.mockResolvedValue(undefined);
    closeDatabasePoolMock.mockResolvedValue(undefined);

    await runDatabaseCheck();

    expect(closeDatabasePoolMock).toHaveBeenCalledTimes(1);

    checkDatabaseConnectionMock.mockRejectedValue(new Error("database exploded"));
    await runDatabaseCheck();

    expect(closeDatabasePoolMock).toHaveBeenCalledTimes(2);
  });
});
