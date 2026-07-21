import crypto from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import {
  rebuildAttendanceForBiometricDate,
} from "../src/modules/attendance/attendance.repository.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `part14-${crypto.randomUUID()}`;
const rulesDate = "1999-01-04";
const weeklyOffDate = "1999-01-05";
const holidayDate = "1999-01-06";
const boundaryDate = "1999-01-07";
const assignmentBeforeDate = "1999-01-08";
const assignmentAfterDate = "1999-01-09";
const overnightDate = "1999-01-10";
const biometricIds: number[] = [];
let nextBiometricId = crypto.randomInt(100_000_000, 900_000_000);
let adminCookie = "";
let managerCookie = "";
let rulesShiftId = "";
let weeklyOffShiftId = "";
let overnightShiftId = "";
let secondShiftId = "";
let attendanceHolidayId = "";

function uniqueBiometricId(): number {
  nextBiometricId += 1;
  biometricIds.push(nextBiometricId);
  return nextBiometricId;
}

function istDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hours, minutes, seconds = 0] = time.split(":").map(Number) as [number, number, number?];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - 330 * 60_000);
}

async function createSession(role: "ADMIN" | "MANAGER"): Promise<string> {
  const email = `${marker}-${role.toLowerCase()}@test.invalid`;
  const username = `${marker}-${role.toLowerCase()}`;
  const user = (await pool.query(
    "INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test-only',$3,true) RETURNING id",
    [email, username, role],
  )).rows[0];
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await authRepository.createSession(user.id, tokenHash, new Date(Date.now() + 3_600_000), "part14-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

interface ShiftOptions {
  startTime?: string;
  endTime?: string;
  graceMinutes?: number;
  minimumWorkMinutes?: number;
  earlyExitToleranceMinutes?: number;
  checkoutAfterMinutes?: number;
  weeklyOffDays?: number[];
  overnight?: boolean;
}

async function createShift(suffix: string, options: ShiftOptions = {}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO shifts (
       name, start_time, end_time, grace_minutes, minimum_work_minutes,
       early_exit_tolerance_minutes, checkin_before_minutes,
       checkout_after_minutes, weekly_off_days, is_overnight, active
     ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,true) RETURNING id`,
    [
      `${marker}-${suffix}`,
      options.startTime ?? "09:00:00",
      options.endTime ?? "18:00:00",
      options.graceMinutes ?? 15,
      options.minimumWorkMinutes ?? 420,
      options.earlyExitToleranceMinutes ?? 15,
      options.checkoutAfterMinutes ?? 60,
      options.weeklyOffDays ?? [],
      options.overnight ?? false,
    ],
  );
  return result.rows[0].id as string;
}

interface EmployeeOptions {
  shiftId?: string;
  joiningDate?: string;
  active?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
}

async function createEmployee(suffix: string, options: EmployeeOptions = {}): Promise<{ id: string; biometricId: number }> {
  const biometricId = uniqueBiometricId();
  const result = await pool.query(
    `INSERT INTO employees (biometric_id,name,joining_date,active)
     VALUES ($1,$2,$3::date,$4) RETURNING id`,
    [biometricId, `${marker}-${suffix}`, options.joiningDate ?? "1999-01-01", options.active ?? true],
  );
  const id = result.rows[0].id as string;
  if (options.shiftId) {
    await pool.query(
      `INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from,effective_to)
       VALUES($1,$2,$3::date,$4::date)`,
      [id, options.shiftId, options.effectiveFrom ?? "1999-01-01", options.effectiveTo ?? null],
    );
  }
  return { id, biometricId };
}

async function addPunch(biometricId: number, date: string, time: string): Promise<number> {
  const result = await pool.query(
    `INSERT INTO raw_attendance_punches(biometric_id,punch_time,raw_payload,source_event_key)
     VALUES($1,$2,'{}'::jsonb,$3) RETURNING id`,
    [biometricId, istDateTime(date, time), `${marker}-${crypto.randomUUID()}`],
  );
  return Number(result.rows[0].id);
}

async function attendanceRecord(biometricId: number, date: string) {
  return (await pool.query(
    `SELECT attendance_key,attendance_date::text,employee_id,shift_id,status,holiday_id,
            raw_punch_count,late_minutes,early_exit_minutes,working_minutes
     FROM daily_attendance_records WHERE biometric_id=$1 AND attendance_date=$2::date`,
    [biometricId, date],
  )).rows[0] as Record<string, unknown> | undefined;
}

const ruleCases = [
  { name: "within grace", suffix: "present", punches: ["09:15:00", "18:00:00"], status: "PRESENT" },
  { name: "after grace", suffix: "late", punches: ["09:16:00", "18:00:00"], status: "LATE" },
  { name: "early checkout", suffix: "early", punches: ["09:00:00", "17:44:00"], status: "EARLY_EXIT" },
  { name: "late plus early exit", suffix: "late-early", punches: ["09:16:00", "17:44:00"], status: "LATE_AND_EARLY_EXIT" },
  { name: "below minimum work", suffix: "half-day", punches: ["09:00:00", "14:00:00"], status: "HALF_DAY" },
  { name: "one punch", suffix: "missing", punches: ["10:00:00"], status: "MISSING_PUNCH" },
] as const;

const ruleEmployees = new Map<string, { id: string; biometricId: number }>();
let absentEmployee: { id: string; biometricId: number };
let weeklyOffEmployee: { id: string; biometricId: number };
let holidayEmployee: { id: string; biometricId: number };
let futureEmployee: { id: string; biometricId: number };
let inactiveEmployee: { id: string; biometricId: number };
let assignmentEmployee: { id: string; biometricId: number };
let overnightEmployee: { id: string; biometricId: number };
let outOfShiftPunchId = 0;

describe("Part 14 attendance rules and protected actions", () => {
  beforeAll(async () => {
    adminCookie = await createSession("ADMIN");
    managerCookie = await createSession("MANAGER");

    rulesShiftId = await createShift("rules");
    weeklyOffShiftId = await createShift("weekly-off", { weeklyOffDays: [1] });
    overnightShiftId = await createShift("overnight", {
      startTime: "22:00:00",
      endTime: "06:00:00",
      overnight: true,
      checkoutAfterMinutes: 0,
    });
    secondShiftId = await createShift("second", { startTime: "10:00:00", endTime: "19:00:00" });

    for (const testCase of ruleCases) {
      const employee = await createEmployee(testCase.suffix, { shiftId: rulesShiftId });
      ruleEmployees.set(testCase.suffix, employee);
      for (const time of testCase.punches) await addPunch(employee.biometricId, rulesDate, time);
      await rebuildAttendanceForBiometricDate(String(employee.biometricId), rulesDate);
    }

    const presentEmployee = ruleEmployees.get("present")!;
    outOfShiftPunchId = await addPunch(presentEmployee.biometricId, rulesDate, "06:00:00");
    await rebuildAttendanceForBiometricDate(String(presentEmployee.biometricId), rulesDate);

    absentEmployee = await createEmployee("absent-boundary", {
      shiftId: rulesShiftId,
      joiningDate: boundaryDate,
      effectiveFrom: boundaryDate,
    });
    weeklyOffEmployee = await createEmployee("weekly-off-employee", { shiftId: weeklyOffShiftId });
    holidayEmployee = await createEmployee("holiday-employee", { shiftId: rulesShiftId });
    futureEmployee = await createEmployee("future-employee", {
      shiftId: rulesShiftId,
      joiningDate: assignmentBeforeDate,
      effectiveFrom: assignmentBeforeDate,
    });
    inactiveEmployee = await createEmployee("inactive-employee", { shiftId: rulesShiftId, active: false });

    attendanceHolidayId = (await pool.query(
      "INSERT INTO holidays(holiday_date,name,description,active) VALUES($1,$2,$3,true) RETURNING id",
      [holidayDate, `${marker}-attendance-holiday`, "Part 14 attendance holiday"],
    )).rows[0].id as string;

    await request(app).post("/attendance/rebuild").set("Cookie", adminCookie).send({ date: weeklyOffDate }).expect(200);
    await request(app).post("/attendance/rebuild").set("Cookie", adminCookie).send({ date: holidayDate }).expect(200);
    await request(app).post("/attendance/rebuild").set("Cookie", adminCookie).send({ date: boundaryDate }).expect(200);

    assignmentEmployee = await createEmployee("assignment-boundary", {
      shiftId: rulesShiftId,
      effectiveFrom: "1999-01-01",
      effectiveTo: assignmentBeforeDate,
    });
    await pool.query(
      `INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from)
       VALUES($1,$2,$3::date)`,
      [assignmentEmployee.id, secondShiftId, assignmentAfterDate],
    );
    await addPunch(assignmentEmployee.biometricId, assignmentBeforeDate, "09:00:00");
    await addPunch(assignmentEmployee.biometricId, assignmentBeforeDate, "18:00:00");
    await addPunch(assignmentEmployee.biometricId, assignmentAfterDate, "10:00:00");
    await addPunch(assignmentEmployee.biometricId, assignmentAfterDate, "19:00:00");
    await rebuildAttendanceForBiometricDate(String(assignmentEmployee.biometricId), assignmentBeforeDate);
    await rebuildAttendanceForBiometricDate(String(assignmentEmployee.biometricId), assignmentAfterDate);

    overnightEmployee = await createEmployee("overnight-employee", { shiftId: overnightShiftId });
    await addPunch(overnightEmployee.biometricId, overnightDate, "22:05:00");
    await addPunch(overnightEmployee.biometricId, "1999-01-11", "05:55:00");
    await rebuildAttendanceForBiometricDate(String(overnightEmployee.biometricId), overnightDate);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE biometric_id = ANY($1::bigint[]) OR attendance_key LIKE $2", [biometricIds, `${marker}%`]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE source_event_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM salary_history WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM advance_transactions WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [`${marker}%`]);
    await pool.query(
      `DELETE FROM employee_shift_assignments
       WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)
          OR shift_id IN (SELECT id FROM shifts WHERE name LIKE $1)`,
      [`${marker}%`],
    );
    await pool.query("DELETE FROM employees WHERE name LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM holidays WHERE name LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM shifts WHERE name LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM app_users WHERE email LIKE $1", [`${marker}%`]);
  });

  it.each(ruleCases)("classifies $name as $status", async (testCase) => {
    const employee = ruleEmployees.get(testCase.suffix)!;
    const record = await attendanceRecord(employee.biometricId, rulesDate);
    expect(record?.status).toBe(testCase.status);
  });

  it("marks an active employee with no punches absent", async () => {
    expect((await attendanceRecord(absentEmployee.biometricId, boundaryDate))?.status).toBe("ABSENT");
  });

  it("marks a configured weekly-off day", async () => {
    expect((await attendanceRecord(weeklyOffEmployee.biometricId, weeklyOffDate))?.status).toBe("WEEKLY_OFF");
  });

  it("marks an active holiday", async () => {
    expect((await attendanceRecord(holidayEmployee.biometricId, holidayDate))?.status).toBe("HOLIDAY");
  });

  it("stores holiday_id on holiday attendance", async () => {
    expect((await attendanceRecord(holidayEmployee.biometricId, holidayDate))?.holiday_id).toBe(attendanceHolidayId);
  });

  it("handles overnight punches on the originating attendance date", async () => {
    const record = await attendanceRecord(overnightEmployee.biometricId, overnightDate);
    expect(record).toMatchObject({ status: "PRESENT", shift_id: overnightShiftId, raw_punch_count: 2 });
  });

  it("includes the joining date and excludes dates before joining", async () => {
    expect((await attendanceRecord(absentEmployee.biometricId, boundaryDate))?.status).toBe("ABSENT");
    expect(await attendanceRecord(futureEmployee.biometricId, boundaryDate)).toBeUndefined();
  });

  it("excludes inactive employees from no-punch rebuilds", async () => {
    expect(await attendanceRecord(inactiveEmployee.biometricId, boundaryDate)).toBeUndefined();
  });

  it("uses the shift assignment effective on each boundary date", async () => {
    expect((await attendanceRecord(assignmentEmployee.biometricId, assignmentBeforeDate))?.shift_id).toBe(rulesShiftId);
    expect((await attendanceRecord(assignmentEmployee.biometricId, assignmentAfterDate))?.shift_id).toBe(secondShiftId);
  });

  it("keeps rebuilds idempotent", async () => {
    const employee = ruleEmployees.get("late")!;
    await rebuildAttendanceForBiometricDate(String(employee.biometricId), rulesDate);
    await rebuildAttendanceForBiometricDate(String(employee.biometricId), rulesDate);
    const count = await pool.query(
      "SELECT count(*) FROM daily_attendance_records WHERE biometric_id=$1 AND attendance_date=$2::date",
      [employee.biometricId, rulesDate],
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it("records OUT_OF_SHIFT without overwriting valid attendance", async () => {
    const employee = ruleEmployees.get("present")!;
    const record = await attendanceRecord(employee.biometricId, rulesDate);
    const exception = (await pool.query(
      "SELECT exception_type FROM attendance_exceptions WHERE raw_punch_id=$1",
      [outOfShiftPunchId],
    )).rows[0];
    expect(record).toMatchObject({ status: "PRESENT", raw_punch_count: 2 });
    expect(exception?.exception_type).toBe("OUT_OF_SHIFT");
  });

  it("deactivates and reactivates an employee while preserving the row", async () => {
    const employee = await createEmployee("status-employee");
    await request(app).patch(`/employees/${employee.id}/status`).set("Cookie", adminCookie).send({ active: false }).expect(200);
    expect((await pool.query("SELECT active FROM employees WHERE id=$1", [employee.id])).rows[0].active).toBe(false);
    await request(app).patch(`/employees/${employee.id}/status`).set("Cookie", adminCookie).send({ active: true }).expect(200);
    expect((await pool.query("SELECT active FROM employees WHERE id=$1", [employee.id])).rows[0].active).toBe(true);
  });

  it("permanently deletes an employee without history", async () => {
    const employee = await createEmployee("unused-employee");
    await request(app).delete(`/employees/${employee.id}`).set("Cookie", adminCookie).expect(204);
    expect((await pool.query("SELECT 1 FROM employees WHERE id=$1", [employee.id])).rowCount).toBe(0);
  });

  it("blocks employee deletion when history exists with the required message", async () => {
    const employee = await createEmployee("historical-employee");
    await pool.query("INSERT INTO salary_history(employee_id,monthly_salary,effective_from) VALUES($1,1000,'1999-01-01')", [employee.id]);
    const response = await request(app).delete(`/employees/${employee.id}`).set("Cookie", adminCookie).expect(409);
    expect(response.body.message).toBe("Cannot delete this employee because historical records exist. Deactivate the employee instead.");
    expect((await pool.query("SELECT 1 FROM employees WHERE id=$1", [employee.id])).rowCount).toBe(1);
  });

  it("deactivates and reactivates a shift while preserving assignments", async () => {
    const shiftId = await createShift("status-shift");
    const employee = await createEmployee("status-shift-employee", { shiftId });
    await request(app).patch(`/shifts/${shiftId}/status`).set("Cookie", adminCookie).send({ active: false }).expect(200);
    expect((await pool.query("SELECT active FROM shifts WHERE id=$1", [shiftId])).rows[0].active).toBe(false);
    await request(app).patch(`/shifts/${shiftId}/status`).set("Cookie", adminCookie).send({ active: true }).expect(200);
    expect((await pool.query("SELECT count(*) FROM employee_shift_assignments WHERE employee_id=$1", [employee.id])).rows[0].count).toBe("1");
  });

  it("permanently deletes an unused shift", async () => {
    const shiftId = await createShift("unused-shift");
    await request(app).delete(`/shifts/${shiftId}`).set("Cookie", adminCookie).expect(204);
    expect((await pool.query("SELECT 1 FROM shifts WHERE id=$1", [shiftId])).rowCount).toBe(0);
  });

  it("blocks deletion of an assigned or historically referenced shift", async () => {
    const assignedShiftId = await createShift("assigned-shift");
    await createEmployee("assigned-shift-employee", { shiftId: assignedShiftId });
    const assignedResponse = await request(app).delete(`/shifts/${assignedShiftId}`).set("Cookie", adminCookie).expect(409);
    expect(assignedResponse.body.message).toContain("Deactivate the shift instead.");

    const historicalShiftId = await createShift("historical-shift");
    const historicalBiometricId = uniqueBiometricId();
    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,attendance_date,biometric_id,shift_id,status)
       VALUES($1,'1999-02-01',$2,$3,'ABSENT')`,
      [`${marker}-historical-shift`, historicalBiometricId, historicalShiftId],
    );
    const historyResponse = await request(app).delete(`/shifts/${historicalShiftId}`).set("Cookie", adminCookie).expect(409);
    expect(historyResponse.body.message).toContain("Deactivate the shift instead.");
  });

  it("edits holiday name, date, description, and active state", async () => {
    const created = await request(app).post("/holidays").set("Cookie", adminCookie).send({
      holiday_date: "1999-02-02",
      name: `${marker}-edit-before`,
      description: "Before",
      active: true,
    }).expect(201);
    const response = await request(app).patch(`/holidays/${created.body.id}`).set("Cookie", adminCookie).send({
      holiday_date: "1999-02-03",
      name: `${marker}-edit-after`,
      description: "After",
      active: false,
    }).expect(200);
    expect(response.body).toMatchObject({
      holiday_date: "1999-02-03",
      name: `${marker}-edit-after`,
      description: "After",
      active: false,
    });
    const cleared = await request(app).patch(`/holidays/${created.body.id}`).set("Cookie", adminCookie).send({
      description: null,
    }).expect(200);
    expect(cleared.body.description).toBeNull();
  });

  it("deactivates and reactivates a holiday", async () => {
    const created = await request(app).post("/holidays").set("Cookie", adminCookie).send({
      holiday_date: "1999-02-04",
      name: `${marker}-status-holiday`,
    }).expect(201);
    await request(app).patch(`/holidays/${created.body.id}/status`).set("Cookie", adminCookie).send({ active: false }).expect(200);
    const response = await request(app).patch(`/holidays/${created.body.id}/status`).set("Cookie", adminCookie).send({ active: true }).expect(200);
    expect(response.body.active).toBe(true);
  });

  it("permanently deletes an unused holiday", async () => {
    const created = await request(app).post("/holidays").set("Cookie", adminCookie).send({
      holiday_date: "1999-02-05",
      name: `${marker}-unused-holiday`,
    }).expect(201);
    await request(app).delete(`/holidays/${created.body.id}`).set("Cookie", adminCookie).expect(204);
    expect((await pool.query("SELECT 1 FROM holidays WHERE id=$1", [created.body.id])).rowCount).toBe(0);
  });

  it("blocks deletion of a holiday referenced by attendance", async () => {
    const created = await request(app).post("/holidays").set("Cookie", adminCookie).send({
      holiday_date: "1999-02-06",
      name: `${marker}-historical-holiday`,
    }).expect(201);
    const historicalBiometricId = uniqueBiometricId();
    await pool.query(
      `INSERT INTO daily_attendance_records(attendance_key,attendance_date,biometric_id,holiday_id,status)
       VALUES($1,'1999-02-06',$2,$3,'HOLIDAY')`,
      [`${marker}-historical-holiday`, historicalBiometricId, created.body.id],
    );
    const response = await request(app).delete(`/holidays/${created.body.id}`).set("Cookie", adminCookie).expect(409);
    expect(response.body.message).toBe("Cannot delete this holiday because historical attendance exists. Deactivate the holiday instead.");
  });

  it("restricts all permanent delete endpoints to ADMIN", async () => {
    const employee = await createEmployee("manager-delete-employee");
    const shiftId = await createShift("manager-delete-shift");
    const holiday = await request(app).post("/holidays").set("Cookie", adminCookie).send({
      holiday_date: "1999-02-07",
      name: `${marker}-manager-delete-holiday`,
    }).expect(201);

    await request(app).delete(`/employees/${employee.id}`).set("Cookie", managerCookie).expect(403);
    await request(app).delete(`/shifts/${shiftId}`).set("Cookie", managerCookie).expect(403);
    await request(app).delete(`/holidays/${holiday.body.id}`).set("Cookie", managerCookie).expect(403);

    expect((await pool.query("SELECT 1 FROM employees WHERE id=$1", [employee.id])).rowCount).toBe(1);
    expect((await pool.query("SELECT 1 FROM shifts WHERE id=$1", [shiftId])).rowCount).toBe(1);
    expect((await pool.query("SELECT 1 FROM holidays WHERE id=$1", [holiday.body.id])).rowCount).toBe(1);
  });
});
