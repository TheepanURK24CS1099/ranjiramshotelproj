import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { createShift } from "../src/modules/shifts/shifts.service.js";
import { rebuildAttendanceForBiometricDate, rebuildAttendanceForAllActiveEmployees, listAttendance } from "../src/modules/attendance/attendance.repository.js";
import { attendance as getAttendanceReport } from "../src/modules/reports/reports.service.js";
import { generate as generatePayroll, listRecords as listPayrollRecords } from "../src/modules/payroll/payroll.service.js";

const pool = getDatabasePool();
const marker = `verify-${crypto.randomUUID()}`;
const attendanceDate = "3026-07-25";

function istDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hours, minutes, seconds = 0] = time.split(":").map(Number) as [number, number, number?];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - 330 * 60_000);
}

describe("Split-Shift Final Verification Suite", () => {
  let employeeId: string;
  let biometricId: number;
  let splitShiftId: string;

  beforeAll(async () => {
    await pool.query("DELETE FROM employee_payroll_records WHERE payroll_period_id IN (SELECT id FROM payroll_periods WHERE notes LIKE $1 OR year = 3026)", [`%${marker}%`]);
    await pool.query("DELETE FROM payroll_periods WHERE notes LIKE $1 OR year = 3026", [`%${marker}%`]);

    biometricId = crypto.randomInt(90_000_000, 99_000_000);
    const empRes = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '3026-07-01')
       RETURNING id`,
      [biometricId, `EmpVerify-${marker}`, `EMP-${biometricId}`]
    );
    employeeId = empRes.rows[0].id;

    splitShiftId = (
      await createShift({
        name: `SplitVerify-${marker}`,
        sessions: [
          {
            session_number: 1,
            start_time: "07:00",
            end_time: "13:00",
            grace_minutes: 15,
            minimum_work_minutes: 360,
            early_exit_tolerance_minutes: 5,
            checkin_before_minutes: 30,
            checkout_after_minutes: 60,
            crosses_midnight: false,
            active: true,
          },
          {
            session_number: 2,
            start_time: "19:00",
            end_time: "23:00",
            grace_minutes: 15,
            minimum_work_minutes: 240,
            early_exit_tolerance_minutes: 5,
            checkin_before_minutes: 30,
            checkout_after_minutes: 60,
            crosses_midnight: false,
            active: true,
          },
        ],
      })
    ).id;

    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '3026-07-01')`,
      [employeeId, splitShiftId]
    );

    await pool.query(
      `INSERT INTO employee_salary_history (employee_id, salary_type, monthly_salary, active, effective_from)
       VALUES ($1, 'MONTHLY', 30000.00, true, '3026-07-01')`,
      [employeeId]
    );
  });

  afterAll(async () => {
    delete process.env.ATTENDANCE_TEST_NOW;
    if (employeeId) {
      await pool.query("DELETE FROM employee_payroll_records WHERE employee_id = $1 OR payroll_period_id IN (SELECT id FROM payroll_periods WHERE notes LIKE $2)", [employeeId, `%${marker}%`]);
      await pool.query("DELETE FROM employee_salary_history WHERE employee_id = $1", [employeeId]);
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = $1", [employeeId]);
      await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = $1", [employeeId]);
      await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId]);
      await pool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
    }
    await pool.query("DELETE FROM payroll_periods WHERE notes LIKE $1 OR year = 3026", [`%${marker}%`]);
    await pool.query("DELETE FROM shift_sessions WHERE shift_id = $1", [splitShiftId]);
    await pool.query("DELETE FROM shifts WHERE id = $1", [splitShiftId]);
  });

  it("VERIFICATION 1: 10-hour total work, 6-hour break excluded", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId]);
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9)`,
      [
        biometricId,
        istDateTime(attendanceDate, "07:00"),
        `${marker}-v1-1`,
        istDateTime(attendanceDate, "13:00"),
        `${marker}-v1-2`,
        istDateTime(attendanceDate, "19:00"),
        `${marker}-v1-3`,
        istDateTime(attendanceDate, "23:00"),
        `${marker}-v1-4`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    expect(rec.working_minutes).toBe(600); // 10 hours
    expect(rec.session_records?.length).toBe(2);
    expect(rec.session_records?.[0]?.worked_minutes).toBe(360); // 6 hours
    expect(rec.session_records?.[1]?.worked_minutes).toBe(240); // 4 hours

    // Break 13:00 -> 19:00 (360 mins) is NOT included in working_minutes
    expect(rec.working_minutes).not.toBe(960);
  });

  it("VERIFICATION 2: Employee appears only ONCE in reports", async () => {
    const report = await getAttendanceReport({ date: attendanceDate, employeeId });
    expect(report.items.length).toBe(1);
    expect(report.items[0]?.employee_id).toBe(employeeId);
    expect(report.pagination.total).toBe(1);
  });

  it("VERIFICATION 3: Session 2 stays NOT_STARTED before evening (at 10:00 AM)", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId]);
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3)`,
      [biometricId, istDateTime(attendanceDate, "07:00"), `${marker}-v3-1`]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "10:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId });
    const s1 = records[0]?.session_records?.[0];
    const s2 = records[0]?.session_records?.[1];

    expect(s1?.status).toBe("CURRENTLY_CHECKED_IN");
    expect(s2?.status).toBe("NOT_STARTED");
    expect(s2?.missing_punch).toBe(false);
  });

  it("VERIFICATION 4: Missing Session 2 checkout creates missing punch, not a wrong pairing", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId]);
    // 07:00, 13:00 (Session 1 complete), 19:00 (Session 2 in), no punch at 23:00.
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7)`,
      [
        biometricId,
        istDateTime(attendanceDate, "07:00"),
        `${marker}-v4-1`,
        istDateTime(attendanceDate, "13:00"),
        `${marker}-v4-2`,
        istDateTime(attendanceDate, "19:00"),
        `${marker}-v4-3`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId });
    const s1 = records[0]?.session_records?.[0];
    const s2 = records[0]?.session_records?.[1];

    expect(s1?.status).toBe("COMPLETED");
    expect(s1?.worked_minutes).toBe(360);
    expect(s2?.status).toBe("MISSING_OUT");
    expect(s2?.worked_minutes).toBe(0);
    expect(records[0]?.status).toBe("MISSING_PUNCH");

    // S1 checkout (13:00) was NOT mispaired with S2 checkin (19:00)
    expect(s1?.punch_out_id).not.toBeNull();
    expect(s2?.punch_in_id).not.toBeNull();
  });

  it("VERIFICATION 5: No raw punch is used twice", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId]);
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9)`,
      [
        biometricId,
        istDateTime(attendanceDate, "07:00"),
        `${marker}-v5-1`,
        istDateTime(attendanceDate, "13:00"),
        `${marker}-v5-2`,
        istDateTime(attendanceDate, "19:00"),
        `${marker}-v5-3`,
        istDateTime(attendanceDate, "23:00"),
        `${marker}-v5-4`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId });
    const s1 = records[0]?.session_records?.[0];
    const s2 = records[0]?.session_records?.[1];

    const s1Punches = [s1?.punch_in_id, s1?.punch_out_id].filter(Boolean);
    const s2Punches = [s2?.punch_in_id, s2?.punch_out_id].filter(Boolean);

    const intersection = s1Punches.filter((id) => s2Punches.includes(id));
    expect(intersection.length).toBe(0); // No punch assigned twice!
  });

  it("VERIFICATION 6: Existing single-session employees still work", async () => {
    const singleShift = await createShift({
      name: `SingleVerif-${marker}`,
      start_time: "09:00",
      end_time: "17:00",
    });

    const bioIdSingle = crypto.randomInt(90_000_000, 99_000_000);
    const empSingle = (
      await pool.query(
        `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
         VALUES ($1, $2, $3, true, '2026-07-01') RETURNING id`,
        [bioIdSingle, `EmpSingle-${marker}`, `EMP-${bioIdSingle}`]
      )
    ).rows[0].id;

    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '2026-07-01')`,
      [empSingle, singleShift.id]
    );

    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5)`,
      [
        bioIdSingle,
        istDateTime(attendanceDate, "09:00"),
        `${marker}-vs-1`,
        istDateTime(attendanceDate, "17:00"),
        `${marker}-vs-2`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "20:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(bioIdSingle), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: empSingle });
    expect(records.length).toBe(1);
    expect(records[0]?.status).toBe("PRESENT");
    expect(records[0]?.working_minutes).toBe(480);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = $1", [empSingle]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = $1", [empSingle]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [bioIdSingle]);
    await pool.query("DELETE FROM employees WHERE id = $1", [empSingle]);
    await pool.query("DELETE FROM shift_sessions WHERE shift_id = $1", [singleShift.id]);
    await pool.query("DELETE FROM shifts WHERE id = $1", [singleShift.id]);
  });

  it("VERIFICATION 7: Payroll does not incorrectly count a partial day as full pay", async () => {
    // Set employee attendance for 2026-07-01 to 2026-07-31:
    // Only Session 1 completed on 2026-07-25 (360 mins out of 600 min minimum required work).
    // Total minimum required work = 360 + 240 = 600. Worked = 360 < 600 -> status = HALF_DAY!
    // Session 1: 07:00 -> 13:00 (360 mins). Session 2: 19:00 -> 19:30 (30 mins). Total worked = 390 mins.
    // Minimum required work = 600 mins -> evaluated status = HALF_DAY.
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId]);
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9)`,
      [
        biometricId,
        istDateTime(attendanceDate, "07:00"),
        `${marker}-v7-1`,
        istDateTime(attendanceDate, "13:00"),
        `${marker}-v7-2`,
        istDateTime(attendanceDate, "19:00"),
        `${marker}-v7-3`,
        istDateTime(attendanceDate, "19:30"),
        `${marker}-v7-4`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId });
    expect(records[0]?.status).toBe("HALF_DAY"); // Evaluates to HALF_DAY because 390m worked < 600m minimum required work!

    // Create test payroll period for July 2026
    const adminUser = (await pool.query("SELECT id FROM app_users WHERE role = 'ADMIN' AND active = true LIMIT 1")).rows[0];
    const adminId = adminUser ? adminUser.id : (await pool.query("INSERT INTO app_users (email, username, password_hash, role, active) VALUES ($1, $2, 'hash', 'ADMIN', true) RETURNING id", [`${marker}-admin@test.invalid`, `${marker}-admin`])).rows[0].id;

    await pool.query("DELETE FROM employee_payroll_records WHERE payroll_period_id IN (SELECT id FROM payroll_periods WHERE year = 3026 AND month = 7)");
    await pool.query("DELETE FROM payroll_periods WHERE year = 3026 AND month = 7");

    const periodRes = await pool.query(
      `INSERT INTO payroll_periods (year, month, period_start, period_end, status, notes, generated_by)
       VALUES (3026, 7, '3026-07-01', '3026-07-31', 'DRAFT', $1, $2) RETURNING id`,
      [`Test period ${marker}`, adminId]
    );
    const periodId = periodRes.rows[0].id;

    await generatePayroll(periodId, adminId, true);

    const pRecords = await listPayrollRecords(periodId);
    const empPRecord = pRecords.find((r) => r.employee_id === employeeId);

    expect(empPRecord).toBeDefined();
    // HALF_DAY counts as 0.5 payable day. 1 day of HALF_DAY = 0.5 payable day.
    expect(Number(empPRecord.half_days)).toBe(1);
    expect(Number(empPRecord.payable_days)).toBe(0.5); // 0.5 days, NOT 1.0 full day!

    // Monthly salary is 30,000. Daily rate for July (31 days) = 30000/31 = 967.74.
    // Deduction for 30.5 unpaid days = 967.74 * 30.5 = 29516.13. Gross = 30,000, Net = 483.87.
    // Full pay is NOT granted for partial days!
    expect(Number(empPRecord.attendance_deduction)).toBeGreaterThan(0);
    expect(Number(empPRecord.net_pay)).toBeLessThan(30000);
  });

  it("VERIFICATION 8: Session status derivation validation (Null checkIn cannot be CURRENTLY_CHECKED_IN)", async () => {
    // 1. Session 17:00:00 - 22:40:00 split shift
    const shift1722 = await createShift({
      name: `Shift1722-${marker}`,
      sessions: [
        {
          session_number: 1,
          start_time: "17:00:00",
          end_time: "22:40:00",
          grace_minutes: 0,
          minimum_work_minutes: 0,
          early_exit_tolerance_minutes: 0,
          checkin_before_minutes: 15,
          checkout_after_minutes: 30,
          crosses_midnight: false,
          active: true,
        },
      ],
    });

    const bioIdSession = crypto.randomInt(90_000_000, 99_000_000);
    const empSession = (
      await pool.query(
        `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
         VALUES ($1, $2, $3, true, '3026-07-01') RETURNING id`,
        [bioIdSession, `EmpSession-${marker}`, `EMP-${bioIdSession}`]
      )
    ).rows[0].id;

    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '3026-07-01')`,
      [empSession, shift1722.id]
    );

    // Case A: Null In + Null Out during active session (at 18:00) -> Daily status MUST BE CHECK_IN_MISSING, session_records = []
    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "18:00").toISOString();
    await rebuildAttendanceForAllActiveEmployees(attendanceDate);
    let records = await listAttendance({ date: attendanceDate, employeeId: empSession });
    expect(records[0]?.status).toBe("CHECK_IN_MISSING");
    expect(records[0]?.session_records).toEqual([]);

    // Case B: Valid In + Null Out during active session (at 18:00 with In at 17:00) -> CURRENTLY_CHECKED_IN
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3)`,
      [bioIdSession, istDateTime(attendanceDate, "17:00"), `${marker}-sess-in`]
    );
    await rebuildAttendanceForBiometricDate(String(bioIdSession), attendanceDate);
    records = await listAttendance({ date: attendanceDate, employeeId: empSession });
    let s1 = records[0]?.session_records?.[0];
    expect(s1?.punch_in_at).not.toBeNull();
    expect(s1?.punch_out_at).toBeNull();
    expect(s1?.status).toBe("CURRENTLY_CHECKED_IN");

    // Case C: Valid In + Null Out after checkout window (at 23:59) -> MISSING_OUT
    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(bioIdSession), attendanceDate);
    records = await listAttendance({ date: attendanceDate, employeeId: empSession });
    s1 = records[0]?.session_records?.[0];
    expect(s1?.punch_in_at).not.toBeNull();
    expect(s1?.punch_out_at).toBeNull();
    expect(s1?.status).toBe("MISSING_OUT");

    // Case D: Future session (at 12:00 PM before 17:00) -> Daily status PENDING, session_records = []
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [bioIdSession]);
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = $1", [empSession]);
    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "12:00").toISOString();
    await rebuildAttendanceForAllActiveEmployees(attendanceDate);
    records = await listAttendance({ date: attendanceDate, employeeId: empSession });
    expect(records[0]?.status).toBe("PENDING");
    expect(records[0]?.session_records).toEqual([]);

    // Clean up temporary test data
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = $1", [empSession]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = $1", [empSession]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [bioIdSession]);
    await pool.query("DELETE FROM employees WHERE id = $1", [empSession]);
    await pool.query("DELETE FROM shift_sessions WHERE shift_id = $1", [shift1722.id]);
    await pool.query("DELETE FROM shifts WHERE id = $1", [shift1722.id]);
  });
});

