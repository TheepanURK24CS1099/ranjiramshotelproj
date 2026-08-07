import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { rebuildAttendanceForBiometricDate, listAttendance } from "../src/modules/attendance/attendance.repository.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `comp-verify-${crypto.randomUUID().slice(0, 8)}`;
const date1Aug = "2026-08-01";
const date2Aug = "2026-08-02";
const biometricIdBase = crypto.randomInt(80_000_000, 95_000_000);

const biometricIds = {
  sarasu: biometricIdBase + 1,
  dhanabal: biometricIdBase + 2,
  todayCheckedIn: biometricIdBase + 3,
  todayCompleted: biometricIdBase + 4,
  splitBothCompleted: biometricIdBase + 5,
  splitOneCompleted: biometricIdBase + 6,
  splitNoneCompleted: biometricIdBase + 7,
  singleCompleted: biometricIdBase + 8,
  singleMissing: biometricIdBase + 9,
  overnight: biometricIdBase + 10,
  reportEmp: biometricIdBase + 11,
};

let shiftIdSarasu = "";
let shiftIdSplit = "";
let shiftIdSingle = "";
let shiftIdOvernight = "";
let managerCookie = "";

function istDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hours, minutes, seconds = 0] = time.split(":").map(Number) as [number, number, number?];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - 330 * 60_000);
}

async function createSession(role: "MANAGER"): Promise<string> {
  const email = `${marker}-${role.toLowerCase()}@test.invalid`;
  const username = `${marker}-${role.toLowerCase()}`;
  const user = (await pool.query("INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test-only',$3,true) RETURNING id", [email, username, role])).rows[0];
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await authRepository.createSession(user.id, hash, new Date(Date.now() + 3_600_000), "verify-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

async function createShift(
  name: string,
  startTime: string,
  endTime: string,
  isOvernight: boolean,
  graceMinutes = 15,
  checkoutAfterMinutes = 60
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO shifts (name, start_time, end_time, grace_minutes, minimum_work_minutes, early_exit_tolerance_minutes, is_overnight, checkin_before_minutes, checkout_after_minutes, active)
     VALUES ($1, $2, $3, $4, 240, 30, $5, 60, $6, true)
     RETURNING id`,
    [name, startTime, endTime, graceMinutes, isOvernight, checkoutAfterMinutes]
  );
  return result.rows[0].id as string;
}

async function createSplitShift(name: string): Promise<string> {
  const shiftRes = await pool.query(
    `INSERT INTO shifts (name, start_time, end_time, grace_minutes, minimum_work_minutes, is_overnight, checkin_before_minutes, checkout_after_minutes, active)
     VALUES ($1, '06:30:00', '22:00:00', 15, 240, false, 60, 60, true)
     RETURNING id`,
    [name]
  );
  const shiftId = shiftRes.rows[0].id as string;

  await pool.query(
    `INSERT INTO shift_sessions (shift_id, session_number, start_time, end_time, grace_minutes, minimum_work_minutes, checkin_before_minutes, checkout_after_minutes, active)
     VALUES 
       ($1, 1, '06:30:00', '13:00:00', 15, 120, 60, 60, true),
       ($1, 2, '14:00:00', '22:00:00', 15, 120, 60, 60, true)`,
    [shiftId]
  );

  return shiftId;
}

async function createEmployeeWithAssignment(
  name: string,
  biometricId: number,
  shiftId: string,
  startDate = "2026-07-01"
): Promise<string> {
  const empRes = await pool.query(
    `INSERT INTO employees (biometric_id, name, phone, department, designation, joining_date, weekly_off_day, active)
     VALUES ($1, $2, NULL, 'Testing', 'Staff', $3::date, NULL, true)
     RETURNING id`,
    [biometricId, name, startDate]
  );
  const empId = empRes.rows[0].id as string;

  await pool.query(
    `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
     VALUES ($1, $2, $3::date)`,
    [empId, shiftId, startDate]
  );

  return empId;
}

async function insertPunch(biometricId: number, timestamp: Date): Promise<void> {
  const sourceEventKey = `${marker}-${biometricId}-${timestamp.toISOString()}`;
  await pool.query(
    `INSERT INTO raw_attendance_punches (device_id, biometric_id, punch_time, source_event_key)
     VALUES (NULL, $1, $2, $3)`,
    [biometricId, timestamp, sourceEventKey]
  );
}

describe("Comprehensive Attendance System Verification Suite", () => {
  beforeAll(async () => {
    managerCookie = await createSession("MANAGER");

    // SARASU shift: 05:45 AM -> 02:00 PM, grace 15 mins (06:01 AM is 1 min LATE), checkout_after 60 mins (04:00 PM is OUT OF SHIFT)
    shiftIdSarasu = await createShift(`${marker}-sarasu-shift`, "05:45:00", "14:00:00", false, 15, 60);
    shiftIdSingle = await createShift(`${marker}-single-shift`, "09:00:00", "17:00:00", false, 15, 60);
    shiftIdOvernight = await createShift(`${marker}-night-shift`, "22:00:00", "06:00:00", true, 0, 120);
    shiftIdSplit = await createSplitShift(`${marker}-split-shift`);
  });

  afterAll(async () => {
    delete process.env.ATTENDANCE_TEST_NOW;
    await pool.query("DELETE FROM attendance_exceptions WHERE biometric_id >= $1 AND biometric_id <= $2", [biometricIdBase, biometricIdBase + 25]);
    await pool.query("DELETE FROM daily_attendance_records WHERE biometric_id >= $1 AND biometric_id <= $2", [biometricIdBase, biometricIdBase + 25]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id >= $1 AND biometric_id <= $2", [biometricIdBase, biometricIdBase + 25]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id IN (SELECT id FROM employees WHERE biometric_id >= $1 AND biometric_id <= $2)", [biometricIdBase, biometricIdBase + 25]);
    await pool.query("DELETE FROM employees WHERE biometric_id >= $1 AND biometric_id <= $2", [biometricIdBase, biometricIdBase + 25]);
    const shiftIds = [shiftIdSarasu, shiftIdSingle, shiftIdOvernight, shiftIdSplit].filter(Boolean);
    if (shiftIds.length > 0) {
      await pool.query("DELETE FROM shift_sessions WHERE shift_id = ANY($1::uuid[])", [shiftIds]);
      await pool.query("DELETE FROM shifts WHERE id = ANY($1::uuid[])", [shiftIds]);
    }
    await pool.query("DELETE FROM app_users WHERE username LIKE $1", [`${marker}-%`]);
  });

  it("1. Verify 1 Aug (SARASU): Out-of-Shift Checkout (06:01 IN, 04:00 PM OUT)", async () => {
    const empId = await createEmployeeWithAssignment("SARASU", biometricIds.sarasu, shiftIdSarasu);

    // Punches: 06:01 AM (IN) and 04:00 PM (OUT) on 1 Aug 2026
    await insertPunch(biometricIds.sarasu, istDateTime(date1Aug, "06:01:00"));
    await insertPunch(biometricIds.sarasu, istDateTime(date1Aug, "16:00:00"));

    process.env.ATTENDANCE_TEST_NOW = istDateTime(date1Aug, "23:59:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricIds.sarasu), date1Aug);

    const records = await listAttendance({ date: date1Aug, employeeId: empId });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    expect(rec.punch_in_at).not.toBeNull();
    expect(rec.punch_out_at).not.toBeNull();
    expect(rec.working_minutes).toBe(599); // 9h 59m
    expect(rec.status).toBe("LATE"); // Evaluated as LATE (Counts as Present)
    expect(rec.note).toBe("Checkout outside shift window");

    // Verify OUT_OF_SHIFT exception retained for audit log
    const exRes = await pool.query("SELECT * FROM attendance_exceptions WHERE biometric_id = $1", [biometricIds.sarasu]);
    const oosEx = exRes.rows.find((r) => r.exception_type === "OUT_OF_SHIFT");
    expect(oosEx).toBeDefined();
  });

  it("2. Verify 1 Aug (DHANABAL): Split Shift (Session 1 Completed, Session 2 Missing Punch, Next-Day Punch Not Reused)", async () => {
    const empId = await createEmployeeWithAssignment("DHANABAL", biometricIds.dhanabal, shiftIdSplit);

    // 01 Aug Session 1: 06:31 AM (IN) -> 09:19 AM (OUT)
    await insertPunch(biometricIds.dhanabal, istDateTime(date1Aug, "06:31:00"));
    await insertPunch(biometricIds.dhanabal, istDateTime(date1Aug, "09:19:00"));

    // 01 Aug Session 2: 01:57 PM (IN)
    await insertPunch(biometricIds.dhanabal, istDateTime(date1Aug, "13:57:00"));

    // 02 Aug: 06:25 AM (IN on next day)
    await insertPunch(biometricIds.dhanabal, istDateTime(date2Aug, "06:25:00"));

    process.env.ATTENDANCE_TEST_NOW = istDateTime(date2Aug, "23:59:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricIds.dhanabal), date1Aug);

    const records = await listAttendance({ date: date1Aug, employeeId: empId });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    // Session 1 early exit makes overall timing status EARLY_EXIT (a Present state)
    expect(["PRESENT", "EARLY_EXIT", "LATE_AND_EARLY_EXIT"]).toContain(rec.status);
    expect(rec.session_records?.length).toBe(2);

    const s1 = rec.session_records?.[0];
    const s2 = rec.session_records?.[1];

    expect(s1?.status).toBe("EARLY_EXIT"); // 06:31 AM (within 15m grace) & 09:19 AM vs 13:00 PM (early exit)
    expect(s1?.worked_minutes).toBe(168); // 06:31 -> 09:19 = 2h 48m

    expect(s2?.status).toBe("MISSING_OUT");
    expect(s2?.worked_minutes).toBe(0);

    // 01:57 PM was NOT mispaired with next day's 06:25 AM (no 16+ hour session)
    expect(s2?.punch_out_id).toBeNull();
  });

  it("3. Verify Today's Attendance (2 Aug): Active Check-in vs Completed Shift", async () => {
    const empCheckedInId = await createEmployeeWithAssignment("ActiveEmp", biometricIds.todayCheckedIn, shiftIdSingle);
    const empCompletedId = await createEmployeeWithAssignment("DoneEmp", biometricIds.todayCompleted, shiftIdSingle);

    // empCheckedIn punches IN at 09:00 AM today (no OUT yet)
    await insertPunch(biometricIds.todayCheckedIn, istDateTime(date2Aug, "09:00:00"));

    // empCompleted punches IN at 09:00 AM today and OUT at 05:00 PM today
    await insertPunch(biometricIds.todayCompleted, istDateTime(date2Aug, "09:00:00"));
    await insertPunch(biometricIds.todayCompleted, istDateTime(date2Aug, "17:00:00"));

    process.env.ATTENDANCE_TEST_NOW = istDateTime(date2Aug, "11:00:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricIds.todayCheckedIn), date2Aug);
    await rebuildAttendanceForBiometricDate(String(biometricIds.todayCompleted), date2Aug);

    const recActive = (await listAttendance({ date: date2Aug, employeeId: empCheckedInId }))[0]!;
    const recDone = (await listAttendance({ date: date2Aug, employeeId: empCompletedId }))[0]!;

    expect(recActive.status).toBe("CURRENTLY_CHECKED_IN");
    expect(recDone.status).toBe("PRESENT");
  });

  it("4. Verify Split Shifts: Completed + Completed vs Partial vs None", async () => {
    const empBoth = await createEmployeeWithAssignment("SplitBoth", biometricIds.splitBothCompleted, shiftIdSplit);
    const empOne = await createEmployeeWithAssignment("SplitOne", biometricIds.splitOneCompleted, shiftIdSplit);
    const empNone = await createEmployeeWithAssignment("SplitNone", biometricIds.splitNoneCompleted, shiftIdSplit);

    // Both sessions completed: S1 (06:30 -> 13:00), S2 (14:00 -> 22:00)
    await insertPunch(biometricIds.splitBothCompleted, istDateTime(date1Aug, "06:30:00"));
    await insertPunch(biometricIds.splitBothCompleted, istDateTime(date1Aug, "13:00:00"));
    await insertPunch(biometricIds.splitBothCompleted, istDateTime(date1Aug, "14:00:00"));
    await insertPunch(biometricIds.splitBothCompleted, istDateTime(date1Aug, "22:00:00"));

    // One session completed: S1 completed, S2 missing out
    await insertPunch(biometricIds.splitOneCompleted, istDateTime(date1Aug, "06:30:00"));
    await insertPunch(biometricIds.splitOneCompleted, istDateTime(date1Aug, "13:00:00"));

    // None completed: S1 missing out, S2 no punches
    await insertPunch(biometricIds.splitNoneCompleted, istDateTime(date1Aug, "06:30:00"));

    process.env.ATTENDANCE_TEST_NOW = istDateTime(date1Aug, "23:59:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricIds.splitBothCompleted), date1Aug);
    await rebuildAttendanceForBiometricDate(String(biometricIds.splitOneCompleted), date1Aug);
    await rebuildAttendanceForBiometricDate(String(biometricIds.splitNoneCompleted), date1Aug);

    const recBoth = (await listAttendance({ date: date1Aug, employeeId: empBoth }))[0]!;
    const recOne = (await listAttendance({ date: date1Aug, employeeId: empOne }))[0]!;
    const recNone = (await listAttendance({ date: date1Aug, employeeId: empNone }))[0]!;

    expect(recBoth.status).toBe("PRESENT");
    expect(recOne.status).toBe("PRESENT"); // Completed S1 makes daily status PRESENT
    expect(recNone.status).toBe("PRESENT"); // Valid punch inside shift window makes daily status PRESENT
  });

  it("5. Verify Single-Session Shifts: Completed vs Missing", async () => {
    const empComp = await createEmployeeWithAssignment("SingleDone", biometricIds.singleCompleted, shiftIdSingle);
    const empMiss = await createEmployeeWithAssignment("SingleMiss", biometricIds.singleMissing, shiftIdSingle);

    await insertPunch(biometricIds.singleCompleted, istDateTime(date1Aug, "09:00:00"));
    await insertPunch(biometricIds.singleCompleted, istDateTime(date1Aug, "17:00:00"));

    await insertPunch(biometricIds.singleMissing, istDateTime(date1Aug, "09:00:00"));

    process.env.ATTENDANCE_TEST_NOW = istDateTime(date1Aug, "23:59:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricIds.singleCompleted), date1Aug);
    await rebuildAttendanceForBiometricDate(String(biometricIds.singleMissing), date1Aug);

    const recComp = (await listAttendance({ date: date1Aug, employeeId: empComp }))[0]!;
    const recMiss = (await listAttendance({ date: date1Aug, employeeId: empMiss }))[0]!;

    expect(recComp.status).toBe("PRESENT");
    expect(recMiss.status).toBe("PRESENT");
  });

  it("6. Verify Overnight Shifts: Spans midnight correctly (22:00 PM Day 1 -> 06:00 AM Day 2)", async () => {
    const empNight = await createEmployeeWithAssignment("OvernightEmp", biometricIds.overnight, shiftIdOvernight);

    // Punch IN: 22:05 PM on 1 Aug, Punch OUT: 06:15 AM on 2 Aug
    await insertPunch(biometricIds.overnight, istDateTime(date1Aug, "22:05:00"));
    await insertPunch(biometricIds.overnight, istDateTime(date2Aug, "06:15:00"));

    process.env.ATTENDANCE_TEST_NOW = istDateTime(date2Aug, "23:59:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricIds.overnight), date1Aug);

    const recNight = (await listAttendance({ date: date1Aug, employeeId: empNight }))[0]!;

    expect(recNight.status).toBe("LATE"); // 22:05 vs 22:00 (grace 0)
    expect(recNight.working_minutes).toBe(490); // 8h 10m
    expect(recNight.punch_in_at).not.toBeNull();
    expect(recNight.punch_out_at).not.toBeNull();
  });

  it("7. Verify Reports and Summaries API endpoints", async () => {
    const empId = await createEmployeeWithAssignment("ReportEmp", biometricIds.reportEmp, shiftIdSingle);

    await insertPunch(biometricIds.reportEmp, istDateTime(date1Aug, "09:00:00"));
    await insertPunch(biometricIds.reportEmp, istDateTime(date1Aug, "17:00:00"));

    process.env.ATTENDANCE_TEST_NOW = istDateTime(date1Aug, "23:59:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricIds.reportEmp), date1Aug);

    const summaryRes = await request(app)
      .get(`/reports/attendance-summary?fromDate=${date1Aug}&toDate=${date1Aug}`)
      .set("Cookie", managerCookie)
      .expect(200);

    expect(summaryRes.body).toBeDefined();

    const empReportRes = await request(app)
      .get(`/reports/employees/${empId}/attendance?fromDate=${date1Aug}&toDate=${date1Aug}`)
      .set("Cookie", managerCookie)
      .expect(200);

    expect(empReportRes.body).toBeDefined();
  });
});
