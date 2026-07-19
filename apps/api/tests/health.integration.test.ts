import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../src/app.js";

describe("health endpoint", () => {
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
});
