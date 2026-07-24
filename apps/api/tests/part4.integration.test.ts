import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `part4-${crypto.randomUUID()}`;
const serialNumber = `SER-${crypto.randomInt(100000, 999999)}`;

async function createSession(role: "ADMIN" | "MANAGER"): Promise<string> {
  const email = `${marker}-${role.toLowerCase()}@test.invalid`;
  const username = `${marker}-${role.toLowerCase()}`;
  const user = (
    await pool.query(
      "INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test-only',$3,true) RETURNING id",
      [email, username, role],
    )
  ).rows[0] as { id: string };
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await authRepository.createSession(user.id, hash, new Date(Date.now() + 3_600_000), "part4-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

describe("Part 4: Simplified Biometric Device Page", () => {
  let adminCookie = "";
  let managerCookie = "";
  let deviceId = "";

  beforeAll(async () => {
    [adminCookie, managerCookie] = await Promise.all([createSession("ADMIN"), createSession("MANAGER")]);

    const res = await pool.query(
      `INSERT INTO devices(device_code, name, model, serial_number, firmware_version, active, status, last_seen, last_sync, last_ip)
       VALUES ($1, $2, 'MB160', $3, 'v1.0.0', true, 'ONLINE', NOW(), NOW(), '192.168.1.50')
       RETURNING id`,
      [`${marker}-code`, `${marker}-device`, serialNumber],
    );
    deviceId = (res.rows[0] as { id: string }).id;

    // Insert a raw punch to verify backend raw punch storage remains unchanged
    await pool.query(
      `INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, source_event_key)
       VALUES ($1, 1001, '2995-05-01 08:30:00', $2)`,
      [deviceId, `${marker}-punch-1`],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE source_event_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM devices WHERE id=$1", [deviceId]);
    await pool.query("DELETE FROM app_users WHERE username LIKE $1", [`${marker}%`]);
  });

  it("device response includes status, last_seen, last_sync, and last_raw_punch_time", async () => {
    const res = await request(app).get("/devices").set("Cookie", adminCookie).expect(200);

    const devices = res.body as Array<Record<string, unknown>>;
    const device = devices.find((d) => d.id === deviceId);
    expect(device).toBeDefined();
    expect(device).toHaveProperty("status");
    expect(device).toHaveProperty("last_seen");
    expect(device).toHaveProperty("last_sync");
    expect(device).toHaveProperty("last_raw_punch_time");
    expect(device).toHaveProperty("last_ip");
    expect(device).toHaveProperty("firmware_version");
    expect(device).toHaveProperty("active");
  });

  it("allows MANAGER read access to devices but forbids editing", async () => {
    await request(app).get("/devices").set("Cookie", managerCookie).expect(200);
    await request(app)
      .patch(`/devices/${deviceId}`)
      .set("Cookie", managerCookie)
      .send({ name: "Forbidden" })
      .expect(403);
  });

  it("device editing still works", async () => {
    const updateRes = await request(app)
      .patch(`/devices/${deviceId}`)
      .set("Cookie", adminCookie)
      .send({ name: `${marker}-device-updated`, model: "MB160-Pro" })
      .expect(200);

    expect(updateRes.body.name).toBe(`${marker}-device-updated`);
    expect(updateRes.body.model).toBe("MB160-Pro");
  });

  it("activate and deactivate still work", async () => {
    const deactRes = await request(app)
      .patch(`/devices/${deviceId}/deactivate`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(deactRes.body.active).toBe(false);

    const actRes = await request(app)
      .patch(`/devices/${deviceId}/activate`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(actRes.body.active).toBe(true);
  });

  it("ADMS backend ingestion and heartbeats remain fully operational", async () => {
    const res = await request(app)
      .get(`/iclock/getrequest?SN=${encodeURIComponent(serialNumber)}`)
      .expect(200);
    expect(res.text).toBe("OK");
  });

  it("frontend devices page source contains device detail specs and no raw punch UI elements", () => {
    const pagePath = path.resolve(__dirname, "../../web/src/app/(authenticated)/devices/page.tsx");
    const content = fs.readFileSync(pagePath, "utf8");

    // Required fields rendering
    expect(content).toContain("Device Name");
    expect(content).toContain("Model");
    expect(content).toContain("Device Code");
    expect(content).toContain("Serial Number");
    expect(content).toContain("Online / Offline Status");
    expect(content).toContain("Last IP");
    expect(content).toContain("Last Seen");
    expect(content).toContain("Last Sync");
    expect(content).toContain("Last Raw Punch Time");
    expect(content).toContain("Firmware");
    expect(content).toContain("Active / Inactive Status");
    expect(content).toContain("Refresh Status");
    expect(content).toContain("Edit");

    // Removed raw punch UI elements
    expect(content).not.toContain("Recent Raw Device Punches");
    expect(content).not.toContain("Mark Ignored");
    expect(content).not.toContain("Reprocess Selected");
    expect(content).not.toContain("Delete Selected");
    expect(content).not.toContain("Clear Today’s Test Punches");
    expect(content).not.toContain("Clear Selected Date");
    expect(content).not.toContain("Clear Selection");
    expect(content).not.toContain("View All Raw Punches");
    expect(content).not.toContain("Select all visible raw punches");
  });
});
