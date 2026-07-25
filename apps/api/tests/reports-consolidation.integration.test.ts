import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `consolidation-${crypto.randomUUID().slice(0, 8)}`;

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
  await authRepository.createSession(user.id, hash, new Date(Date.now() + 3_600_000), "consolidation-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

describe("Attendance Report Employee Consolidation Integration Tests", () => {
  let adminCookie = "";
  let shiftAId = "";
  let shiftBId = "";
  let emp1Id = "";
  let emp2Id = "";
  const emp1Bio = Math.floor(800000 + Math.random() * 100000).toString();
  const emp2Bio = Math.floor(900000 + Math.random() * 100000).toString();
  const unmatchedBio = Math.floor(700000 + Math.random() * 100000).toString();

  beforeAll(async () => {
    adminCookie = await createSession("ADMIN");

    // Create 2 test shifts
    shiftAId = (
      await pool.query(
        "INSERT INTO shifts(name,start_time,end_time,grace_minutes,minimum_work_minutes) VALUES($1,'09:00','17:00',15,480) RETURNING id",
        [`${marker}-ShiftA`],
      )
    ).rows[0].id;

    shiftBId = (
      await pool.query(
        "INSERT INTO shifts(name,start_time,end_time,grace_minutes,minimum_work_minutes) VALUES($1,'14:00','22:00',15,480) RETURNING id",
        [`${marker}-ShiftB`],
      )
    ).rows[0].id;

    // Create 2 test employees
    emp1Id = (
      await pool.query(
        "INSERT INTO employees(name,employee_code,biometric_id,active) VALUES($1,$2,$3,true) RETURNING id",
        [`${marker}-EmpOne`, `E-${marker}-1`, emp1Bio],
      )
    ).rows[0].id;

    emp2Id = (
      await pool.query(
        "INSERT INTO employees(name,employee_code,biometric_id,active) VALUES($1,$2,$3,true) RETURNING id",
        [`${marker}-EmpTwo`, `E-${marker}-2`, emp2Bio],
      )
    ).rows[0].id;

    // Assign shiftA as current active shift for emp1
    await pool.query(
      "INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from) VALUES($1,$2,'2026-01-01')",
      [emp1Id, shiftAId],
    );

    // Assign shiftB as current active shift for emp2
    await pool.query(
      "INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from) VALUES($1,$2,'2026-01-01')",
      [emp2Id, shiftBId],
    );

    // Populate daily_attendance_records for emp1 across multiple shifts AND historical/unassigned
    // Record 1 for emp1 under ShiftA (Present)
    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,employee_id,biometric_id,shift_id,attendance_date,status,working_minutes)
       VALUES($1,$2,$3,$4,'2026-07-01','PRESENT',480)`,
      [`${marker}-key1`, emp1Id, emp1Bio, shiftAId],
    );
    // Record 2 for emp1 under ShiftB (Late)
    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,employee_id,biometric_id,shift_id,attendance_date,status,working_minutes)
       VALUES($1,$2,$3,$4,'2026-07-02','LATE',450)`,
      [`${marker}-key2`, emp1Id, emp1Bio, shiftBId],
    );
    // Record 3 for emp1 under Historical/Unassigned (shift_id NULL)
    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,employee_id,biometric_id,shift_id,attendance_date,status,working_minutes)
       VALUES($1,$2,$3,NULL,'2026-07-03','PRESENT',480)`,
      [`${marker}-key3`, emp1Id, emp1Bio],
    );

    // Populate daily_attendance_records for emp2 (single shift)
    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,employee_id,biometric_id,shift_id,attendance_date,status,working_minutes)
       VALUES($1,$2,$3,$4,'2026-07-01','PRESENT',480)`,
      [`${marker}-key4`, emp2Id, emp2Bio, shiftBId],
    );

    // Populate unmatched record (employee_id IS NULL)
    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,employee_id,biometric_id,shift_id,attendance_date,status,working_minutes)
       VALUES($1,NULL,$2,$3,'2026-07-01','UNMATCHED',0)`,
      [`${marker}-key5`, unmatchedBio, shiftAId],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE attendance_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id IN ($1,$2)", [emp1Id, emp2Id]);
    await pool.query("DELETE FROM employees WHERE id IN ($1,$2)", [emp1Id, emp2Id]);
    await pool.query("DELETE FROM shifts WHERE id IN ($1,$2)", [shiftAId, shiftBId]);
    await pool.query("DELETE FROM app_users WHERE username LIKE $1", [`${marker}%`]);
  });

  it("1. One employee with records under single shift returns one row", async () => {
    const res = await request(app)
      .get(`/reports/attendance-summary?employeeId=${emp2Id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].employee_id).toBe(emp2Id);
    expect(res.body.items[0].total_working_days).toBe(1);
  });

  it("2. One employee with records under multiple shifts returns one consolidated row", async () => {
    const res = await request(app)
      .get(`/reports/attendance-summary?employeeId=${emp1Id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].employee_id).toBe(emp1Id);
    // Emp 1 has 3 records total (ShiftA, ShiftB, Unassigned)
    expect(res.body.items[0].total_working_days).toBe(3);
    expect(res.body.items[0].present_days).toBe(3); // 2 PRESENT + 1 LATE (both count as present)
    expect(res.body.items[0].late_days).toBe(1);
  });

  it("3. One employee with historical/unassigned records and assigned-shift records returns one row with current shift", async () => {
    const res = await request(app)
      .get(`/reports/attendance-summary?employeeId=${emp1Id}`)
      .set("Cookie", adminCookie)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].shift).toBe(`${marker}-ShiftA`);
  });

  it("4. Two registered employees return exactly two rows", async () => {
    const res = await request(app)
      .get(`/reports/attendance-summary?fromDate=2026-07-01&toDate=2026-07-31`)
      .set("Cookie", adminCookie)
      .expect(200);

    const testItems = res.body.items.filter(
      (item: { employee_id: string }) => item.employee_id === emp1Id || item.employee_id === emp2Id,
    );
    expect(testItems).toHaveLength(2);
  });

  it("5. Pagination total matches the consolidated row count", async () => {
    const res = await request(app)
      .get(`/reports/attendance-summary?fromDate=2026-07-01&toDate=2026-07-31`)
      .set("Cookie", adminCookie)
      .expect(200);

    expect(res.body.pagination.total).toBe(res.body.items.length);
  });

  it("6. Unmatched biometric IDs remain excluded from normal attendance employee table", async () => {
    const res = await request(app)
      .get(`/reports/attendance-summary?fromDate=2026-07-01&toDate=2026-07-31`)
      .set("Cookie", adminCookie)
      .expect(200);

    const unmatchedInTable = res.body.items.find(
      (item: { biometric_id: string }) => item.biometric_id === unmatchedBio,
    );
    expect(unmatchedInTable).toBeUndefined();
  });

  it("7. Historical unmatched summary remains available separately", async () => {
    const res = await request(app)
      .get(`/reports/attendance-summary?fromDate=2026-07-01&toDate=2026-07-31`)
      .set("Cookie", adminCookie)
      .expect(200);

    expect(res.body.summary).toHaveProperty("historicalUnmatchedIds");
    expect(res.body.summary.historicalUnmatchedIds).toBeGreaterThanOrEqual(1);
  });
});
