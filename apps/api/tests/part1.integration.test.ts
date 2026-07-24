import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `part1-${crypto.randomUUID()}`;
let managerCookie = "";

async function createSession(role: "MANAGER"): Promise<string> {
  const email = `${marker}-${role.toLowerCase()}@test.invalid`;
  const username = `${marker}-${role.toLowerCase()}`;
  const user = (await pool.query("INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test-only',$3,true) RETURNING id", [email, username, role])).rows[0];
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await authRepository.createSession(user.id, hash, new Date(Date.now() + 3_600_000), "part1-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

describe("Part 1: Registered Employee Attendance Report", () => {
  const activeBiometricId = crypto.randomInt(1_000_000, 9_000_000);
  const inactiveBiometricId = crypto.randomInt(1_000_000, 9_000_000);
  const unmatchedBiometricId = crypto.randomInt(1_000_000, 9_000_000);
  let activeEmployeeId: string;
  let inactiveEmployeeId: string;

  beforeAll(async () => {
    managerCookie = await createSession("MANAGER");

    // Create an active employee
    const res1 = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date) VALUES ($1, $2, $3, true, CURRENT_DATE) RETURNING id`,
      [activeBiometricId, `${marker}-Active`, `E-ACT`]
    );
    activeEmployeeId = res1.rows[0].id;

    // Create an inactive employee
    const res2 = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date) VALUES ($1, $2, $3, false, CURRENT_DATE) RETURNING id`,
      [inactiveBiometricId, `${marker}-Inactive`, `E-INACT`]
    );
    inactiveEmployeeId = res2.rows[0].id;

    // Insert attendance records for the active employee
    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES ($1, $2, $3, '2025-01-01', 'PRESENT', 480)`,
      [`${marker}-1`, activeEmployeeId, activeBiometricId]
    );

    // Insert attendance records for the inactive employee
    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES ($1, $2, $3, '2025-01-01', 'ABSENT', 0)`,
      [`${marker}-2`, inactiveEmployeeId, inactiveBiometricId]
    );

    // Insert unmatched attendance record
    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES ($1, NULL, $2, '2025-01-01', 'MISSING_PUNCH', 0)`,
      [`${marker}-3`, unmatchedBiometricId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM daily_attendance_records WHERE biometric_id IN ($1, $2, $3)`, [activeBiometricId, inactiveBiometricId, unmatchedBiometricId]);
    await pool.query(`DELETE FROM employees WHERE id IN ($1, $2)`, [activeEmployeeId, inactiveEmployeeId]);
    await pool.query(`DELETE FROM app_users WHERE username LIKE $1`, [`${marker}-%`]);
  });

  it("should only return registered employees in the main table data and respect active filter", async () => {
    // 1. Fetch without filters
    const resAll = await request(app)
      .get("/reports/attendance-summary?fromDate=2025-01-01&toDate=2025-01-01")
      .set("Cookie", managerCookie)
      .expect(200);

    const dataAll = resAll.body;
    
    // Should contain both active and inactive employees
    const employeeNames = dataAll.items.map((i: Record<string, unknown>) => i.employee_name);
    expect(employeeNames).toContain(`${marker}-Active`);
    expect(employeeNames).toContain(`${marker}-Inactive`);
    
    // Should NOT contain unmatched ID
    expect(employeeNames).not.toContain("Unmatched");
    const biometricIds = dataAll.items.map((i: Record<string, unknown>) => i.biometric_id);
    expect(biometricIds).not.toContain(String(unmatchedBiometricId));

    // Summary should reflect registered employees only
    expect(dataAll.summary.historicalUnmatchedIds).toBeGreaterThanOrEqual(1);
    
    // Check required columns
    const firstRow = dataAll.items.find((i: Record<string, unknown>) => i.employee_name === `${marker}-Active`);
    expect(firstRow).toHaveProperty("employee_name");
    expect(firstRow).toHaveProperty("employee_code");
    expect(firstRow).toHaveProperty("biometric_id");
    expect(firstRow).toHaveProperty("shift");
    expect(firstRow).toHaveProperty("active_status", "Active");
    expect(firstRow).toHaveProperty("present_days");
    expect(firstRow).toHaveProperty("absent_days");
    expect(firstRow).toHaveProperty("late_days");
    expect(firstRow).toHaveProperty("missing_punches");
    expect(firstRow).toHaveProperty("total_worked_hours");
    expect(firstRow).toHaveProperty("overtime_hours");
    expect(firstRow).toHaveProperty("view_report", "View Report");


    // 2. Fetch with active=true filter
    const resActive = await request(app)
      .get("/reports/attendance-summary?fromDate=2025-01-01&toDate=2025-01-01&active=true")
      .set("Cookie", managerCookie)
      .expect(200);

    const dataActive = resActive.body;
    const activeNames = dataActive.items.map((i: Record<string, unknown>) => i.employee_name);
    expect(activeNames).toContain(`${marker}-Active`);
    expect(activeNames).not.toContain(`${marker}-Inactive`);
  });
});
