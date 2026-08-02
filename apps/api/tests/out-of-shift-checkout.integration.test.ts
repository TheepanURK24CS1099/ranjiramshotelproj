import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { rebuildAttendanceForBiometricDate, rebuildAttendanceForDate, listAttendanceExceptions } from "../src/modules/attendance/attendance.repository.js";
import { listPeriods } from "../src/modules/payroll/payroll.service.js";

const pool = getDatabasePool();
const marker = `oos-test-${crypto.randomUUID()}`;
const attendanceDate = "2026-07-25";
const nextDate = "2026-07-26";
const biometricIdBase = crypto.randomInt(30_000_000, 80_000_000);

const biometricIds = {
  inOutInside: biometricIdBase + 1,
  inOutOutside: biometricIdBase + 2,
  multipleOutside: biometricIdBase + 3,
  overnightOutside: biometricIdBase + 4,
  splitShift: biometricIdBase + 5,
  noCheckout: biometricIdBase + 6,
  dhanabal: biometricIdBase + 7,
};

let shiftIdNormal = "";
let shiftIdOvernight = "";
let shiftIdSplit = "";

function istDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hours, minutes, seconds = 0] = time.split(":").map(Number) as [number, number, number?];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - 330 * 60_000);
}

async function createShift(
  name: string,
  startTime: string,
  endTime: string,
  isOvernight: boolean,
  checkoutAfterMinutes = 60
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO shifts (name, start_time, end_time, grace_minutes, minimum_work_minutes, early_exit_tolerance_minutes, is_overnight, checkin_before_minutes, checkout_after_minutes, active)
     VALUES ($1, $2, $3, 30, 240, 30, $4, 60, $5, true)
     RETURNING id`,
    [name, startTime, endTime, isOvernight, checkoutAfterMinutes]
  );
  return result.rows[0].id as string;
}

async function createSplitShift(name: string): Promise<string> {
  const shiftRes = await pool.query(
    `INSERT INTO shifts (name, start_time, end_time, grace_minutes, minimum_work_minutes, is_overnight, checkin_before_minutes, checkout_after_minutes, active)
     VALUES ($1, '08:00:00', '20:00:00', 15, 240, false, 60, 60, true)
     RETURNING id`,
    [name]
  );
  const shiftId = shiftRes.rows[0].id as string;

  await pool.query(
    `INSERT INTO shift_sessions (shift_id, session_number, start_time, end_time, grace_minutes, minimum_work_minutes, checkin_before_minutes, checkout_after_minutes, active)
     VALUES 
       ($1, 1, '08:00:00', '12:00:00', 15, 120, 60, 60, true),
       ($1, 2, '16:00:00', '20:00:00', 15, 120, 60, 60, true)`,
    [shiftId]
  );

  return shiftId;
}

async function createEmployee(biometricId: number, name: string, shiftId: string): Promise<string> {
  const empRes = await pool.query(
    `INSERT INTO employees (biometric_id, name, phone, department, designation, joining_date, weekly_off_day, active)
     VALUES ($1, $2, NULL, 'Operations', 'Staff', '2026-07-01', NULL, true)
     RETURNING id`,
    [biometricId, name]
  );
  const empId = empRes.rows[0].id as string;

  await pool.query(
    `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
     VALUES ($1, $2, '2026-07-01'::date)`,
    [empId, shiftId]
  );

  return empId;
}

async function insertRawPunch(biometricId: number, punchTime: Date): Promise<number> {
  const sourceEventKey = `${marker}-${biometricId}-${punchTime.toISOString()}`;
  const res = await pool.query(
    `INSERT INTO raw_attendance_punches (device_id, biometric_id, punch_time, source_event_key)
     VALUES (NULL, $1, $2, $3)
     RETURNING id`,
    [biometricId, punchTime, sourceEventKey]
  );
  return Number(res.rows[0].id);
}

describe("Out-of-Shift Auto-Complete Checkout Integration Tests", () => {
  beforeAll(async () => {
    // 1. Setup shifts (05:45 to 14:00 with checkout_after_minutes = 60, so window ends at 15:00)
    shiftIdNormal = await createShift(`${marker}-normal`, "05:45:00", "14:00:00", false, 60);
    shiftIdOvernight = await createShift(`${marker}-night`, "22:00:00", "06:00:00", true, 60);
    shiftIdSplit = await createSplitShift(`${marker}-split`);

    // 2. Setup employees
    await createEmployee(biometricIds.inOutInside, `${marker}-inside`, shiftIdNormal);
    await createEmployee(biometricIds.inOutOutside, `${marker}-outside`, shiftIdNormal);
    await createEmployee(biometricIds.multipleOutside, `${marker}-multi-outside`, shiftIdNormal);
    await createEmployee(biometricIds.overnightOutside, `${marker}-overnight-outside`, shiftIdOvernight);
    await createEmployee(biometricIds.splitShift, `${marker}-split-outside`, shiftIdSplit);
    await createEmployee(biometricIds.noCheckout, `${marker}-no-checkout`, shiftIdNormal);
    await createEmployee(biometricIds.dhanabal, `${marker}-dhanabal`, shiftIdSplit);

    // 3. Insert punches
    // Case 1: valid IN + OUT inside shift (06:01 AM, 01:55 PM)
    await insertRawPunch(biometricIds.inOutInside, istDateTime(attendanceDate, "06:01:00"));
    await insertRawPunch(biometricIds.inOutInside, istDateTime(attendanceDate, "13:55:00"));

    // Case 2: valid IN + OUT outside shift (06:01 AM, 04:00 PM) - 04:00 PM is past window end (03:00 PM)
    await insertRawPunch(biometricIds.inOutOutside, istDateTime(attendanceDate, "06:01:00"));
    await insertRawPunch(biometricIds.inOutOutside, istDateTime(attendanceDate, "16:00:00"));
    await insertRawPunch(biometricIds.inOutOutside, istDateTime(nextDate, "06:00:00"));

    // Case 3: multiple outside punches (06:01 AM, 04:00 PM, 05:00 PM)
    await insertRawPunch(biometricIds.multipleOutside, istDateTime(attendanceDate, "06:01:00"));
    await insertRawPunch(biometricIds.multipleOutside, istDateTime(attendanceDate, "16:00:00"));
    await insertRawPunch(biometricIds.multipleOutside, istDateTime(attendanceDate, "17:00:00"));

    // Case 4: overnight shift with outside punch (22:05 PM Day 1, 08:30 AM Day 2) - window ends at 07:00 AM
    await insertRawPunch(biometricIds.overnightOutside, istDateTime(attendanceDate, "22:05:00"));
    await insertRawPunch(biometricIds.overnightOutside, istDateTime(nextDate, "08:30:00"));

    // Case 5: split shift (Session 1: 08:05 AM, Session 2: 16:05 PM, 22:00 PM outside Session 2 window)
    await insertRawPunch(biometricIds.splitShift, istDateTime(attendanceDate, "08:05:00"));
    await insertRawPunch(biometricIds.splitShift, istDateTime(attendanceDate, "12:00:00"));
    await insertRawPunch(biometricIds.splitShift, istDateTime(attendanceDate, "16:05:00"));
    await insertRawPunch(biometricIds.splitShift, istDateTime(attendanceDate, "22:00:00"));

    // Case 6: no checkout (06:01 AM only)
    await insertRawPunch(biometricIds.noCheckout, istDateTime(attendanceDate, "06:01:00"));

    // Case 7: DHANABAL split shift with Session 1 completed, Session 2 IN (01:57 PM), and next day IN (06:25 AM)
    await insertRawPunch(biometricIds.dhanabal, istDateTime(attendanceDate, "08:05:00"));
    await insertRawPunch(biometricIds.dhanabal, istDateTime(attendanceDate, "12:00:00"));
    await insertRawPunch(biometricIds.dhanabal, istDateTime(attendanceDate, "16:15:00"));
    await insertRawPunch(biometricIds.dhanabal, istDateTime(nextDate, "06:25:00"));

    // Rebuild attendance for test date
    await rebuildAttendanceForDate(attendanceDate);
  });

  afterAll(async () => {
    const allBio = Object.values(biometricIds);
    await pool.query("DELETE FROM daily_attendance_records WHERE biometric_id = ANY($1::bigint[])", [allBio]);
    await pool.query("DELETE FROM attendance_exceptions WHERE biometric_id = ANY($1::bigint[])", [allBio]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE source_event_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id IN (SELECT id FROM employees WHERE biometric_id = ANY($1::bigint[]))", [allBio]);
    await pool.query("DELETE FROM employees WHERE biometric_id = ANY($1::bigint[])", [allBio]);
    await pool.query("DELETE FROM shift_sessions WHERE shift_id = $1", [shiftIdSplit]);
    await pool.query("DELETE FROM shifts WHERE id = ANY($1::uuid[])", [[shiftIdNormal, shiftIdOvernight, shiftIdSplit]]);
  });

  it("evaluates valid IN + OUT inside shift correctly", async () => {
    const record = (
      await pool.query(
        "SELECT status, working_minutes, note FROM daily_attendance_records WHERE attendance_date = $1::date AND biometric_id = $2",
        [attendanceDate, biometricIds.inOutInside]
      )
    ).rows[0];

    expect(record.status).toBe("PRESENT");
    expect(record.working_minutes).toBe(474); // 06:01 to 13:55 = 7h 54m = 474m
    expect(record.note).toBeNull();
  });

  it("auto-completes checkout using single out-of-shift punch and preserves exception", async () => {
    const record = (
      await pool.query(
        `SELECT status, working_minutes, note,
                to_char(punch_in_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_in_ist,
                to_char(punch_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_out_ist
         FROM daily_attendance_records
         WHERE attendance_date = $1::date AND biometric_id = $2`,
        [attendanceDate, biometricIds.inOutOutside]
      )
    ).rows[0];

    expect(record.status).toBe("PRESENT");
    expect(record.punch_in_ist).toBe("06:01");
    expect(record.punch_out_ist).toBe("16:00");
    expect(record.working_minutes).toBe(599); // 06:01 to 16:00 = 9h 59m = 599m
    expect(record.note).toBe("Checkout outside shift window");

    // Verify exception remains stored in attendance_exceptions
    const exceptions = await listAttendanceExceptions(attendanceDate);
    const empException = exceptions.find((x) => String(x.biometric_id) === String(biometricIds.inOutOutside));

    expect(empException).toBeDefined();
    expect(empException?.exception_type).toBe("OUT_OF_SHIFT");
  });

  it("preserves MISSING_PUNCH when multiple outside punches exist", async () => {
    const record = (
      await pool.query(
        "SELECT status, working_minutes, note FROM daily_attendance_records WHERE attendance_date = $1::date AND biometric_id = $2",
        [attendanceDate, biometricIds.multipleOutside]
      )
    ).rows[0];

    expect(record.status).toBe("MISSING_PUNCH");
    expect(record.working_minutes).toBe(0);
    expect(record.note).toBe("Missing punch out");
  });

  it("auto-completes checkout for overnight shift with outside punch on next day", async () => {
    await rebuildAttendanceForBiometricDate(String(biometricIds.overnightOutside), attendanceDate);

    const record = (
      await pool.query(
        `SELECT status, working_minutes, note,
                to_char(punch_in_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_in_ist,
                to_char(punch_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS punch_out_ist
         FROM daily_attendance_records
         WHERE attendance_date = $1::date AND biometric_id = $2`,
        [attendanceDate, biometricIds.overnightOutside]
      )
    ).rows[0];

    expect(record.status).toBe("PRESENT");
    expect(record.punch_in_ist).toBe("22:05");
    expect(record.punch_out_ist).toBe("08:30");
    expect(record.working_minutes).toBe(625); // 22:05 to 08:30 next day = 10h 25m = 625m
    expect(record.note).toBe("Checkout outside shift window");
  });

  it("handles split shifts with out-of-shift punch on session 2 correctly", async () => {
    const record = (
      await pool.query(
        "SELECT status, working_minutes, note FROM daily_attendance_records WHERE attendance_date = $1::date AND biometric_id = $2",
        [attendanceDate, biometricIds.splitShift]
      )
    ).rows[0];

    expect(record.status).toBe("PRESENT");
    expect(record.note).toBe("Checkout outside shift window");
    expect(record.working_minutes).toBeGreaterThan(500);
  });

  it("preserves MISSING_PUNCH when no checkout punch exists", async () => {
    const record = (
      await pool.query(
        "SELECT status, working_minutes, note FROM daily_attendance_records WHERE attendance_date = $1::date AND biometric_id = $2",
        [attendanceDate, biometricIds.noCheckout]
      )
    ).rows[0];

    expect(record.status).toBe("MISSING_PUNCH");
    expect(record.working_minutes).toBe(0);
    expect(record.note).toBe("Missing punch out");
  });

  it("verifies DHANABAL scenario: Session 1 completed, Session 2 missing punch, does not use next-day punch", async () => {
    const record = (
      await pool.query(
        "SELECT status, working_minutes, note, session_records FROM daily_attendance_records WHERE attendance_date = $1::date AND biometric_id = $2",
        [attendanceDate, biometricIds.dhanabal]
      )
    ).rows[0];

    expect(record.status).toBe("MISSING_PUNCH");
    expect(record.note).toBe("Missing punch out");

    const sessions = record.session_records;
    expect(sessions[0].status).toBe("COMPLETED");
    expect(sessions[0].missing_punch).toBe(false);
    expect(sessions[1].status).toBe("MISSING_OUT");
    expect(sessions[1].missing_punch).toBe(true);
    expect(sessions[1].punch_out_at).toBeNull();
  });

  it("leaves payroll calculation unaffected and operational", async () => {
    const periods = await listPeriods();

    expect(periods).toBeDefined();
    expect(Array.isArray(periods)).toBe(true);
  });
});
