import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `part3-${crypto.randomUUID()}`;

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
  await authRepository.createSession(user.id, hash, new Date(Date.now() + 3_600_000), "part3-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

describe("Part 3: Simple Unmatched Biometric Summary", () => {
  const bioRegistered = crypto.randomInt(1_000_000, 9_000_000);
  const bioUnmatched1 = crypto.randomInt(1_000_000, 9_000_000);
  const bioUnmatched2 = crypto.randomInt(1_000_000, 9_000_000);

  let adminCookie = "";
  let managerCookie = "";
  let employeeId = "";

  beforeAll(async () => {
    [adminCookie, managerCookie] = await Promise.all([createSession("ADMIN"), createSession("MANAGER")]);

    const empRes = await pool.query(
      "INSERT INTO employees(biometric_id,name,employee_code,active,joining_date) VALUES($1,$2,$3,true,CURRENT_DATE) RETURNING id",
      [bioRegistered, `${marker}-emp`, `${marker}-code`],
    );
    employeeId = (empRes.rows[0] as { id: string }).id;

    // Registered employee attendance record
    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,attendance_date,employee_id,biometric_id,working_minutes,status)
       VALUES ($1,'2995-04-01',$2,$3,480,'PRESENT')`,
      [`${marker}-rec-reg`, employeeId, bioRegistered],
    );

    // Unmatched attendance records (employee_id IS NULL)
    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,attendance_date,employee_id,biometric_id,working_minutes,status)
       VALUES
         ($1,'2995-04-01',NULL,$2,0,'MISSING_PUNCH'),
         ($3,'2995-04-02',NULL,$2,0,'MISSING_PUNCH'),
         ($4,'2995-04-01',NULL,$5,0,'MISSING_PUNCH')`,
      [
        `${marker}-rec-unm1`, bioUnmatched1,
        `${marker}-rec-unm2`,
        `${marker}-rec-unm3`, bioUnmatched2,
      ],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE attendance_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM employees WHERE id=$1", [employeeId]);
    await pool.query("DELETE FROM app_users WHERE username LIKE $1", [`${marker}%`]);
  });

  it("attendance summary main table only shows registered employees and pagination reflects registered employees", async () => {
    const res = await request(app)
      .get("/reports/attendance-summary?fromDate=2995-04-01&toDate=2995-04-02")
      .set("Cookie", adminCookie)
      .expect(200);

    const items = res.body.items as Array<Record<string, unknown>>;
    const matchedNames = items.map((i) => i.employee_name);
    expect(matchedNames).toContain(`${marker}-emp`);
    // Ensure unmatched biometric IDs do not appear as rows in main table
    expect(items.some((i) => String(i.biometric_id) === String(bioUnmatched1))).toBe(false);
    expect(items.some((i) => String(i.biometric_id) === String(bioUnmatched2))).toBe(false);
    // Unmatched rows do not affect pagination total
    expect(res.body.pagination.total).toBe(1);
  });

  it("unmatched IDs are excluded from totalEmployees and shown as historicalUnmatchedIds count", async () => {
    const res = await request(app)
      .get("/reports/attendance-summary?fromDate=2995-04-01&toDate=2995-04-02")
      .set("Cookie", adminCookie)
      .expect(200);

    const summary = res.body.summary as Record<string, unknown>;
    expect(summary.totalEmployees).toBe(1);
    expect(summary.historicalUnmatchedIds).toBeGreaterThanOrEqual(2);
  });

  it("unmatched rows do not appear in normal attendance CSV/PDF exports", async () => {
    const csvRes = await request(app)
      .get("/reports/attendance-summary/export.csv?fromDate=2995-04-01&toDate=2995-04-02")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(csvRes.text).toContain(`${marker}-emp`);
    expect(csvRes.text).not.toContain(String(bioUnmatched1));
    expect(csvRes.text).not.toContain(String(bioUnmatched2));

    const pdfRes = await request(app)
      .get("/reports/attendance-summary/export.pdf?fromDate=2995-04-01&toDate=2995-04-02")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(pdfRes.body.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("non-admin users (MANAGER) cannot access unmatched biometrics endpoint", async () => {
    await request(app)
      .get("/reports/unmatched-biometrics?fromDate=2995-04-01&toDate=2995-04-02")
      .set("Cookie", managerCookie)
      .expect(403);
  });

  it("admin users can access unmatched biometrics summary details", async () => {
    const res = await request(app)
      .get("/reports/unmatched-biometrics?fromDate=2995-04-01&toDate=2995-04-02")
      .set("Cookie", adminCookie)
      .expect(200);

    const items = res.body.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(2);
    const firstRow = items[0] as Record<string, unknown>;
    expect(firstRow).toHaveProperty("biometric_id");
    expect(firstRow).toHaveProperty("device_name");
    expect(firstRow).toHaveProperty("first_seen");
    expect(firstRow).toHaveProperty("last_seen");
    expect(firstRow).toHaveProperty("total_records");

    // Must NOT expose raw punch timestamps or raw action fields in the record schema
    expect(firstRow).not.toHaveProperty("punch_time");
    expect(firstRow).not.toHaveProperty("source_event_key");
    expect(firstRow).not.toHaveProperty("ignored");
  });

  it("existing employee View Report endpoint still works for registered employees", async () => {
    const res = await request(app)
      .get(`/reports/employees/${employeeId}/attendance?fromDate=2995-04-01&toDate=2995-04-02`)
      .set("Cookie", managerCookie)
      .expect(200);

    expect(res.body.employee).toMatchObject({
      id: employeeId,
      name: `${marker}-emp`,
      employee_code: `${marker}-code`,
    });
    expect(res.body.items).toHaveLength(1);
  });

  it("existing attendance reports still work correctly for MANAGER role", async () => {
    await request(app)
      .get("/reports/attendance-summary")
      .set("Cookie", managerCookie)
      .expect(200);
  });
});
