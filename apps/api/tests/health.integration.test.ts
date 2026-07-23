import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../src/app.js";
import { checkDatabaseConnection } from "../src/infrastructure/database/database.js";

vi.mock("../src/infrastructure/database/database.js", async () => {
  const actual = await vi.importActual<typeof import("../src/infrastructure/database/database.js")>(
    "../src/infrastructure/database/database.js",
  );

  return {
    ...actual,
    checkDatabaseConnection: vi.fn(),
  };
});

const mockCheckDatabaseConnection = vi.mocked(checkDatabaseConnection);

describe("health endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a healthy response with request id", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.headers["x-request-id"]).toBeTypeOf("string");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.body.data.status).toBe("ok");
    expect(response.body.data.service).toBe("hotel-api");
    expect(Number.isNaN(Date.parse(response.body.data.timestamp))).toBe(false);
    expect(response.body.data).toHaveProperty("uptimeSeconds");
    expect(response.body.data.uptimeSeconds).toBeTypeOf("number");
    expect(response.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("returns a structured not-found error with matching request id", async () => {
    const response = await request(app).get("/missing-route").expect(404);

    expect(response.headers["x-request-id"]).toBeTypeOf("string");
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.message).toBe("Route not found");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("replaces a client-provided request id with its own correlated id", async () => {
    const response = await request(app)
      .get("/missing-route")
      .set("x-request-id", "client-controlled-id")
      .expect(404);

    expect(response.headers["x-request-id"]).not.toBe("client-controlled-id");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("returns 200 from /ready when the database check succeeds", async () => {
    mockCheckDatabaseConnection.mockResolvedValue(undefined);

    const response = await request(app).get("/ready").expect(200);

    expect(response.body.data.status).toBe("ready");
  });

  it("returns 200 from /readiness when the database check succeeds", async () => {
    mockCheckDatabaseConnection.mockResolvedValue(undefined);

    const response = await request(app).get("/readiness").expect(200);

    expect(response.body.data.status).toBe("ready");
  });

  it("returns a ready payload with status, service and a valid timestamp", async () => {
    mockCheckDatabaseConnection.mockResolvedValue(undefined);

    const response = await request(app).get("/ready").expect(200);

    expect(response.body.data.service).toBe("hotel-api");
    expect(response.body.data.status).toBe("ready");
    expect(Number.isNaN(Date.parse(response.body.data.timestamp))).toBe(false);
  });

  it("adds a request id header for readiness responses", async () => {
    mockCheckDatabaseConnection.mockResolvedValue(undefined);

    const response = await request(app).get("/ready").expect(200);

    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });

  it("returns 503 from /ready when the database check fails", async () => {
    mockCheckDatabaseConnection.mockRejectedValue(new Error("database exploded"));

    const response = await request(app).get("/ready").expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns a sanitized error payload for readiness failures", async () => {
    mockCheckDatabaseConnection.mockRejectedValue(new Error("database exploded"));

    const response = await request(app).get("/ready").expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(response.body.error.message).toBe("Service is not ready");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("does not expose internal database error text in readiness responses", async () => {
    mockCheckDatabaseConnection.mockRejectedValue(new Error("database exploded"));

    const response = await request(app).get("/ready").expect(503);

    expect(response.text).not.toContain("database exploded");
    expect(response.text).not.toContain("database");
  });

  it("keeps /health returning 200 during a database failure", async () => {
    mockCheckDatabaseConnection.mockRejectedValue(new Error("database exploded"));

    const response = await request(app).get("/health").expect(200);

    expect(response.body.data.status).toBe("ok");
  });

  it("does not trust a client-provided request id for readiness", async () => {
    mockCheckDatabaseConnection.mockRejectedValue(new Error("database exploded"));

    const response = await request(app)
      .get("/ready")
      .set("x-request-id", "client-controlled-id")
      .expect(503);

    expect(response.headers["x-request-id"]).not.toBe("client-controlled-id");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });
});
