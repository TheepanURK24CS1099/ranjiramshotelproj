import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { createShift } from "../src/modules/shifts/shifts.service.js";
import {
  rebuildAttendanceForBiometricDate,
  rebuildAttendanceForAllActiveEmployees,
  listAttendance,
} from "../src/modules/attendance/attendance.repository.js";

const pool = getDatabasePool();
const marker = `zeropunch-${crypto.randomUUID()}`;
const attendanceDate = "3026-08-01";

function istDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hours, minutes, seconds = 0] = time.split(":").map(Number) as [number, number, number?];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - 330 * 60_000);
}

describe("Zero-Punch Session Record Suppression Suite", () => {
  let employeeId1: string;
  let biometricId1: number;
  let singleShiftId: string;

  let employeeId2: string;
  let biometricId2: number;
  let splitShiftId: string;

  let employeeId3: string;
  let biometricId3: number;
  let overnightShiftId: string;

  beforeAll(async () => {
    // 1. Single session shift (09:00 - 17:00)
    singleShiftId = (
      await createShift({
        name: `SingleShift-${marker}`,
        start_time: "09:00",
        end_time: "17:00",
        grace_minutes: 15,
        minimum_work_minutes: 420,
        early_exit_tolerance_minutes: 5,
        checkin_before_minutes: 30,
        checkout_after_minutes: 60,
        is_overnight: false,
      })
    ).id;

    biometricId1 = crypto.randomInt(90_000_000, 99_000_000);
    const emp1 = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '3026-07-01') RETURNING id`,
      [biometricId1, `ZeroEmp1-${marker}`, `EMP-${biometricId1}`]
    );
    employeeId1 = emp1.rows[0].id;
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from) VALUES ($1, $2, '3026-07-01')`,
      [employeeId1, singleShiftId]
    );

    // 2. Split session shift (08:00 - 12:00, 16:00 - 20:00)
    splitShiftId = (
      await createShift({
        name: `SplitShift-${marker}`,
        sessions: [
          {
            session_number: 1,
            start_time: "08:00",
            end_time: "12:00",
            grace_minutes: 15,
            minimum_work_minutes: 240,
            early_exit_tolerance_minutes: 5,
            checkin_before_minutes: 30,
            checkout_after_minutes: 60,
            crosses_midnight: false,
            active: true,
          },
          {
            session_number: 2,
            start_time: "16:00",
            end_time: "20:00",
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

    biometricId2 = crypto.randomInt(90_000_000, 99_000_000);
    const emp2 = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '3026-07-01') RETURNING id`,
      [biometricId2, `ZeroEmp2-${marker}`, `EMP-${biometricId2}`]
    );
    employeeId2 = emp2.rows[0].id;
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from) VALUES ($1, $2, '3026-07-01')`,
      [employeeId2, splitShiftId]
    );

    // 3. Overnight shift (22:00 - 06:00)
    overnightShiftId = (
      await createShift({
        name: `OvernightShift-${marker}`,
        start_time: "22:00",
        end_time: "06:00",
        grace_minutes: 15,
        minimum_work_minutes: 420,
        early_exit_tolerance_minutes: 5,
        checkin_before_minutes: 30,
        checkout_after_minutes: 60,
        is_overnight: true,
      })
    ).id;

    biometricId3 = crypto.randomInt(90_000_000, 99_000_000);
    const emp3 = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '3026-07-01') RETURNING id`,
      [biometricId3, `ZeroEmp3-${marker}`, `EMP-${biometricId3}`]
    );
    employeeId3 = emp3.rows[0].id;
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from) VALUES ($1, $2, '3026-07-01')`,
      [employeeId3, overnightShiftId]
    );
  });

  afterAll(async () => {
    delete process.env.ATTENDANCE_TEST_NOW;
    const empIds = [employeeId1, employeeId2, employeeId3].filter(Boolean);
    const bioIds = [biometricId1, biometricId2, biometricId3].filter(Boolean);
    if (empIds.length > 0) {
      await pool.query("DELETE FROM attendance_exceptions WHERE employee_id = ANY($1::uuid[])", [empIds]);
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = ANY($1::uuid[])", [empIds]);
      await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = ANY($1::uuid[])", [empIds]);
      await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = ANY($1::bigint[])", [bioIds]);
      await pool.query("DELETE FROM employees WHERE id = ANY($1::uuid[])", [empIds]);
    }
    const shiftIds = [singleShiftId, splitShiftId, overnightShiftId].filter(Boolean);
    if (shiftIds.length > 0) {
      await pool.query("DELETE FROM shift_sessions WHERE shift_id = ANY($1::uuid[])", [shiftIds]);
      await pool.query("DELETE FROM shifts WHERE id = ANY($1::uuid[])", [shiftIds]);
    }
  });

  it("1. Zero punches: Status = ABSENT, raw_punch_count = 0, working_minutes = 0, note = 'No biometric attendance recorded', session_records = []", async () => {
    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForAllActiveEmployees(attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: employeeId1 });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    expect(rec.status).toBe("ABSENT");
    expect(rec.raw_punch_count).toBe(0);
    expect(rec.working_minutes).toBe(0);
    expect(rec.note).toBe("No biometric attendance recorded");
    expect(rec.session_records).toEqual([]);
  });

  it("2. One punch: Session record still generated, existing behaviour unchanged", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId1]);
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key) VALUES ($1, $2, $3)`,
      [biometricId1, istDateTime(attendanceDate, "09:00"), `${marker}-onepunch`]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId1), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: employeeId1 });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    expect(rec.raw_punch_count).toBe(1);
    expect(rec.session_records?.length).toBe(1);
    expect(rec.session_records?.[0]?.session_number).toBe(1);
    expect(rec.session_records?.[0]?.status).toBe("MISSING_OUT");
  });

  it("3. Valid IN + OUT: Session generated, working minutes unchanged", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId1]);
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key) VALUES ($1, $2, $3), ($1, $4, $5)`,
      [
        biometricId1,
        istDateTime(attendanceDate, "09:00"),
        `${marker}-inout-1`,
        istDateTime(attendanceDate, "17:00"),
        `${marker}-inout-2`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId1), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: employeeId1 });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    expect(rec.status).toBe("PRESENT");
    expect(rec.working_minutes).toBe(480);
    expect(rec.session_records?.length).toBe(1);
    expect(rec.session_records?.[0]?.worked_minutes).toBe(480);
    expect(rec.session_records?.[0]?.status).toBe("COMPLETED");
  });

  it("4. Multiple sessions: Split shift with complete punches generates all session records", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId2]);
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9)`,
      [
        biometricId2,
        istDateTime(attendanceDate, "08:00"),
        `${marker}-split-1`,
        istDateTime(attendanceDate, "12:00"),
        `${marker}-split-2`,
        istDateTime(attendanceDate, "16:00"),
        `${marker}-split-3`,
        istDateTime(attendanceDate, "20:00"),
        `${marker}-split-4`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId2), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: employeeId2 });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    expect(rec.status).toBe("PRESENT");
    expect(rec.working_minutes).toBe(480);
    expect(rec.session_records?.length).toBe(2);
    expect(rec.session_records?.[0]?.worked_minutes).toBe(240);
    expect(rec.session_records?.[1]?.worked_minutes).toBe(240);
  });

  it("5. Overnight shift: Session generated, working minutes accurate", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId3]);
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key) VALUES ($1, $2, $3), ($1, $4, $5)`,
      [
        biometricId3,
        istDateTime(attendanceDate, "22:00"),
        `${marker}-night-1`,
        istDateTime("3026-08-02", "06:00"),
        `${marker}-night-2`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime("3026-08-02", "10:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId3), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: employeeId3 });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    expect(rec.status).toBe("PRESENT");
    expect(rec.working_minutes).toBe(480);
    expect(rec.session_records?.length).toBe(1);
    expect(rec.session_records?.[0]?.status).toBe("COMPLETED");
  });

  it("6. Partial punches across multiple sessions: Split shift with Session 1 punches preserves Session 2 missing breakdown", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId2]);
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key) VALUES ($1, $2, $3), ($1, $4, $5)`,
      [
        biometricId2,
        istDateTime(attendanceDate, "08:00"),
        `${marker}-partial-1`,
        istDateTime(attendanceDate, "12:00"),
        `${marker}-partial-2`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId2), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: employeeId2 });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    expect(rec.status).toBe("MISSING_PUNCH");
    expect(rec.working_minutes).toBe(240);
    expect(rec.session_records?.length).toBe(2);
    expect(rec.session_records?.[0]?.status).toBe("COMPLETED");
    expect(rec.session_records?.[1]?.status).toBe("CHECK_IN_MISSING");
  });

  it("7. Out-of-shift punch only: raw punch exists outside every session window, not treated as zero-punch day, OUT_OF_SHIFT exception created, session records generated", async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId1]);
    await pool.query("DELETE FROM attendance_exceptions WHERE employee_id = $1", [employeeId1]);

    const rawRes = await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key) VALUES ($1, $2, $3) RETURNING id`,
      [biometricId1, istDateTime(attendanceDate, "03:00"), `${marker}-outofshift-only`]
    );
    const punchId = rawRes.rows[0].id;

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId1), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: employeeId1 });
    expect(records.length).toBe(1);
    const rec = records[0]!;

    expect(rec.session_records?.length).toBe(1);
    expect(rec.session_records?.[0]?.session_number).toBe(1);
    expect(rec.session_records?.[0]?.status).toBe("CHECK_IN_MISSING");

    const exceptions = await pool.query(
      "SELECT exception_type FROM attendance_exceptions WHERE raw_punch_id = $1",
      [punchId]
    );
    expect(exceptions.rowCount).toBe(1);
    expect(exceptions.rows[0]?.exception_type).toBe("OUT_OF_SHIFT");
  });
});
