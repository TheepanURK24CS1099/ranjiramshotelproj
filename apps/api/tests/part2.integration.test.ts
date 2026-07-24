import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `part2-${crypto.randomUUID()}`;

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
  await authRepository.createSession(user.id, hash, new Date(Date.now() + 3_600_000), "part2-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

describe("Part 2: Individual Employee Attendance Report", () => {
  const bio = crypto.randomInt(1_000_000, 9_000_000);
  let adminCookie = "";
  let managerCookie = "";
  let employeeId = "";

  beforeAll(async () => {
    [adminCookie, managerCookie] = await Promise.all([createSession("ADMIN"), createSession("MANAGER")]);

    const empRes = await pool.query(
      "INSERT INTO employees(biometric_id,name,employee_code,active,joining_date) VALUES($1,$2,$3,true,CURRENT_DATE) RETURNING id",
      [bio, `${marker}-emp`, `${marker}-code`],
    );
    employeeId = (empRes.rows[0] as { id: string }).id;

    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,attendance_date,employee_id,biometric_id,working_minutes,late_minutes,early_exit_minutes,status)
       VALUES
         ($1,'2995-03-01',$2,$3,480,0,0,'PRESENT'),
         ($4,'2995-03-02',$2,$3,450,25,0,'LATE'),
         ($5,'2995-03-03',$2,$3,0,0,0,'ABSENT'),
         ($6,'2995-03-04',$2,$3,0,0,0,'MISSING_PUNCH')`,
      [
        `${marker}-d1`, employeeId, bio,
        `${marker}-d2`,
        `${marker}-d3`,
        `${marker}-d4`,
      ],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE attendance_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM employees WHERE id=$1", [employeeId]);
    await pool.query("DELETE FROM app_users WHERE username LIKE $1", [`${marker}%`]);
  });

  it("returns 401 without a session", async () => {
    await request(app).get(`/reports/employees/${employeeId}/attendance?fromDate=2995-03-01&toDate=2995-03-04`).expect(401);
  });

  it("returns 404 for an unknown employee ID", async () => {
    const fakeId = crypto.randomUUID();
    await request(app)
      .get(`/reports/employees/${fakeId}/attendance?fromDate=2995-03-01&toDate=2995-03-04`)
      .set("Cookie", adminCookie)
      .expect(404);
  });

  it("returns 200 with employee header fields for admin", async () => {
    const res = await request(app)
      .get(`/reports/employees/${employeeId}/attendance?fromDate=2995-03-01&toDate=2995-03-04`)
      .set("Cookie", adminCookie)
      .expect(200);

    const { employee } = res.body as { employee: Record<string, unknown> };
    expect(employee).toBeDefined();
    expect(employee.name).toBe(`${marker}-emp`);
    expect(employee.employee_code).toBe(`${marker}-code`);
    expect(employee.biometric_id).toBe(String(bio));
    expect(employee.active).toBe(true);
    expect(employee).toHaveProperty("current_shift");
  });

  it("returns correct summary counts", async () => {
    const res = await request(app)
      .get(`/reports/employees/${employeeId}/attendance?fromDate=2995-03-01&toDate=2995-03-04`)
      .set("Cookie", adminCookie)
      .expect(200);

    const { summary } = res.body as { summary: Record<string, unknown> };
    expect(summary.totalWorkingDays).toBe(4);
    expect(summary.presentDays).toBe(2);
    expect(summary.absentDays).toBe(1);
    expect(summary.lateDays).toBe(1);
    expect(summary.missingPunches).toBe(1);
    expect(summary).toHaveProperty("earlyExits");
    expect(summary).toHaveProperty("holidays");
    expect(summary).toHaveProperty("weeklyOffs");
    expect(summary).toHaveProperty("totalWorkedHours");
    expect(summary).toHaveProperty("overtimeHours");
  });

  it("returns daily items with required columns", async () => {
    const res = await request(app)
      .get(`/reports/employees/${employeeId}/attendance?fromDate=2995-03-01&toDate=2995-03-04`)
      .set("Cookie", adminCookie)
      .expect(200);

    const { items } = res.body as { items: Record<string, unknown>[] };
    expect(items.length).toBe(4);
    const row = items[0];
    expect(row).toHaveProperty("date");
    expect(row).toHaveProperty("shift");
    expect(row).toHaveProperty("first_punch_in");
    expect(row).toHaveProperty("last_punch_out");
    expect(row).toHaveProperty("worked_duration");
    expect(row).toHaveProperty("attendance_status");
    expect(row).toHaveProperty("late_by");
    expect(row).toHaveProperty("early_exit_by");
    expect(row).toHaveProperty("overtime");
    expect(row).toHaveProperty("missing_punch");
    expect(row).toHaveProperty("notes");
  });

  it("late_by is populated for LATE records", async () => {
    const res = await request(app)
      .get(`/reports/employees/${employeeId}/attendance?fromDate=2995-03-01&toDate=2995-03-04`)
      .set("Cookie", adminCookie)
      .expect(200);

    const { items } = res.body as { items: Record<string, unknown>[] };
    const lateRow = items.find((r) => r.attendance_status === "LATE");
    expect(lateRow).toBeDefined();
    expect((lateRow as Record<string, unknown>).late_by).not.toBe("—");
  });

  it("date range filter limits records returned", async () => {
    const res = await request(app)
      .get(`/reports/employees/${employeeId}/attendance?fromDate=2995-03-01&toDate=2995-03-01`)
      .set("Cookie", adminCookie)
      .expect(200);

    const { items, summary } = res.body as {
      items: Record<string, unknown>[];
      summary: Record<string, unknown>;
    };
    expect(items.length).toBe(1);
    expect((items[0] as Record<string, unknown>).date).toBe("2995-03-01");
    expect(summary.totalWorkingDays).toBe(1);
    expect(summary.presentDays).toBe(1);
  });

  it("MANAGER can access the individual attendance report", async () => {
    const res = await request(app)
      .get(`/reports/employees/${employeeId}/attendance?fromDate=2995-03-01&toDate=2995-03-04`)
      .set("Cookie", managerCookie)
      .expect(200);
    expect(res.body.employee).toBeDefined();
    expect(res.body.items).toBeDefined();
  });

  it("CSV export returns text/csv with BOM", async () => {
    const res = await request(app)
      .get(`/reports/employees/${employeeId}/attendance/export.csv?fromDate=2995-03-01&toDate=2995-03-04`)
      .set("Cookie", adminCookie)
      .expect("Content-Type", /text\/csv/)
      .expect(200);

    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain("date");
    expect(res.text).toContain("attendance_status");
    expect(res.text.length).toBeGreaterThan(10);
  });

  it("PDF export returns application/pdf with PDF signature", async () => {
    const res = await request(app)
      .get(`/reports/employees/${employeeId}/attendance/export.pdf?fromDate=2995-03-01&toDate=2995-03-04`)
      .set("Cookie", adminCookie)
      .expect("Content-Type", /application\/pdf/)
      .expect(200);

    expect((res.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
    expect((res.body as Buffer).length).toBeGreaterThan(1000);
  });

  it("returns 401 for export without session", async () => {
    await request(app)
      .get(`/reports/employees/${employeeId}/attendance/export.csv?fromDate=2995-03-01&toDate=2995-03-04`)
      .expect(401);
  });
});
