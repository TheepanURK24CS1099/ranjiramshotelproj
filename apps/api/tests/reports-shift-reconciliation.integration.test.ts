import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { employeeAttendanceDetail, attendance as getAttendanceReport } from "../src/modules/reports/reports.service.js";
import { createShift } from "../src/modules/shifts/shifts.service.js";

const pool = getDatabasePool();
const marker = `reconcile-${crypto.randomUUID()}`;

describe("Shift 1 / Shift 2 Reporting Calculation Verification", () => {
  let employeeId: string;
  let splitEmployeeId: string;
  let biometricId: number;
  let splitBiometricId: number;
  let singleShiftId: string;
  let splitShiftId: string;

  beforeAll(async () => {
    biometricId = crypto.randomInt(80_000_000, 89_000_000);
    splitBiometricId = crypto.randomInt(90_000_000, 99_000_000);

    const emp1Res = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '2026-08-01') RETURNING id`,
      [biometricId, `SingleEmp-${marker}`, `EMP-${biometricId}`]
    );
    employeeId = emp1Res.rows[0].id;

    const emp2Res = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '2026-08-01') RETURNING id`,
      [splitBiometricId, `SplitEmp-${marker}`, `EMP-${splitBiometricId}`]
    );
    splitEmployeeId = emp2Res.rows[0].id;

    singleShiftId = (
      await createShift({
        name: `SingleShift-${marker}`,
        sessions: [
          {
            session_number: 1,
            start_time: "09:00",
            end_time: "17:00",
            grace_minutes: 15,
            minimum_work_minutes: 480,
            early_exit_tolerance_minutes: 5,
            checkin_before_minutes: 30,
            checkout_after_minutes: 60,
            crosses_midnight: false,
            active: true,
          },
        ],
      })
    ).id;

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
            start_time: "17:00",
            end_time: "21:00",
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
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from) VALUES ($1, $2, '2026-08-01')`,
      [employeeId, singleShiftId]
    );
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from) VALUES ($1, $2, '2026-08-01')`,
      [splitEmployeeId, splitShiftId]
    );

    // Insert test attendance records for single shift employee:
    // 1. PRESENT day (Late session)
    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, attendance_date, employee_id, biometric_id, shift_id, working_minutes, raw_punch_count, status, session_records)
       VALUES ($1, '2026-08-01', $2, $3, $4, 450, 2, 'LATE', $5::jsonb)`,
      [
        `${marker}-1`, employeeId, biometricId, singleShiftId,
        JSON.stringify([{
          session_number: 1, status: "LATE", punch_in_id: 101, punch_in_at: "2026-08-01T09:30:00Z",
          punch_out_id: 102, punch_out_at: "2026-08-01T17:00:00Z", worked_minutes: 450, late_minutes: 30, early_exit_minutes: 0, missing_punch: false
        }])
      ]
    );

    // 2. CHECK_OUT_MISSING day
    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, attendance_date, employee_id, biometric_id, shift_id, working_minutes, raw_punch_count, status, session_records)
       VALUES ($1, '2026-08-02', $2, $3, $4, 0, 1, 'MISSING_PUNCH', $5::jsonb)`,
      [
        `${marker}-2`, employeeId, biometricId, singleShiftId,
        JSON.stringify([{
          session_number: 1, status: "MISSING_OUT", punch_in_id: 103, punch_in_at: "2026-08-02T09:00:00Z",
          punch_out_id: null, punch_out_at: null, worked_minutes: 0, late_minutes: 0, early_exit_minutes: 0, missing_punch: true
        }])
      ]
    );

    // 3. ABSENT day (Check-in missing)
    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, attendance_date, employee_id, biometric_id, shift_id, working_minutes, raw_punch_count, status, session_records)
       VALUES ($1, '2026-08-03', $2, $3, $4, 0, 0, 'ABSENT', $5::jsonb)`,
      [
        `${marker}-3`, employeeId, biometricId, singleShiftId,
        JSON.stringify([{
          session_number: 1, status: "CHECK_IN_MISSING", punch_in_id: null, punch_in_at: null,
          punch_out_id: null, punch_out_at: null, worked_minutes: 0, late_minutes: 0, early_exit_minutes: 0, missing_punch: true
        }])
      ]
    );

    // 4. PENDING day
    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, attendance_date, employee_id, biometric_id, shift_id, working_minutes, raw_punch_count, status, session_records)
       VALUES ($1, '2026-08-04', $2, $3, $4, 0, 0, 'PENDING', $5::jsonb)`,
      [
        `${marker}-4`, employeeId, biometricId, singleShiftId,
        JSON.stringify([{
          session_number: 1, status: "PENDING", punch_in_id: null, punch_in_at: null,
          punch_out_id: null, punch_out_at: null, worked_minutes: 0, late_minutes: 0, early_exit_minutes: 0, missing_punch: false
        }])
      ]
    );

    // Split Shift Records (2 sessions per day):
    // Day 1: Session 1 LATE (started), Session 2 COMPLETED (started)
    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, attendance_date, employee_id, biometric_id, shift_id, working_minutes, raw_punch_count, status, session_records)
       VALUES ($1, '2026-08-01', $2, $3, $4, 450, 4, 'LATE', $5::jsonb)`,
      [
        `${marker}-s1`, splitEmployeeId, splitBiometricId, splitShiftId,
        JSON.stringify([
          { session_number: 1, status: "LATE", punch_in_id: 201, punch_in_at: "2026-08-01T08:15:00Z", punch_out_id: 202, punch_out_at: "2026-08-01T12:00:00Z", worked_minutes: 225, late_minutes: 15, early_exit_minutes: 0, missing_punch: false },
          { session_number: 2, status: "COMPLETED", punch_in_id: 203, punch_in_at: "2026-08-01T17:00:00Z", punch_out_id: 204, punch_out_at: "2026-08-01T21:00:00Z", worked_minutes: 240, late_minutes: 0, early_exit_minutes: 0, missing_punch: false }
        ])
      ]
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE attendance_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id IN ($1, $2)", [employeeId, splitEmployeeId]);
    await pool.query("DELETE FROM employees WHERE id IN ($1, $2)", [employeeId, splitEmployeeId]);
    await pool.query("DELETE FROM shift_sessions WHERE shift_id IN ($1, $2)", [singleShiftId, splitShiftId]);
    await pool.query("DELETE FROM shifts WHERE id IN ($1, $2)", [singleShiftId, splitShiftId]);
  });

  it("verifies FIX 1 & FIX 5: Present == Completed and Present >= Late", async () => {
    const res = await employeeAttendanceDetail(employeeId, { fromDate: "2026-08-01", toDate: "2026-08-04" });
    const s1 = res.summary.shift1Summary;

    expect(s1.completed).toBe(2);
    expect(s1.present).toBe(2); // Present == Completed!
    expect(s1.late).toBe(1);
    expect(s1.present).toBeGreaterThanOrEqual(s1.late);
    expect(s1.present).toBeGreaterThanOrEqual(s1.earlyExit);
    expect(s1.present).toBeGreaterThanOrEqual(s1.halfDay);
  });

  it("verifies FIX 3 & FIX 4: Expected == Completed + Absent + Pending", async () => {
    const res = await employeeAttendanceDetail(employeeId, { fromDate: "2026-08-01", toDate: "2026-08-04" });
    const s1 = res.summary.shift1Summary;

    expect(s1.expected).toBe(4);
    expect(s1.completed).toBe(2);
    expect(s1.absent).toBe(1);
    expect(s1.pending).toBe(1);

    // Exact reconciliation formula
    expect(s1.expected).toBe(s1.completed + s1.absent + s1.pending);
    expect(s1.expected).toBe(s1.present + s1.absent + s1.pending);
  });

  it("verifies FIX 6 & FIX 7: Check-in Missing vs Check-out Missing separation", async () => {
    const res = await employeeAttendanceDetail(employeeId, { fromDate: "2026-08-01", toDate: "2026-08-04" });
    const s1 = res.summary.shift1Summary;

    expect(s1.checkoutMissing).toBe(1); // Day 2 had punch_in but no punch_out
    expect(s1.checkinMissing).toBe(1);  // Day 3 had no punches
  });

  it("verifies split shift summaries reconcile for both Shift 1 and Shift 2", async () => {
    const res = await employeeAttendanceDetail(splitEmployeeId, { fromDate: "2026-08-01", toDate: "2026-08-01" });
    const s1 = res.summary.shift1Summary;
    const s2 = res.summary.shift2Summary;

    expect(s1.expected).toBe(1);
    expect(s1.completed).toBe(1);
    expect(s1.present).toBe(1);
    expect(s1.late).toBe(1);
    expect(s1.expected).toBe(s1.completed + s1.absent + s1.pending);
    expect(s1.present).toBeGreaterThanOrEqual(s1.late);

    expect(s2.expected).toBe(1);
    expect(s2.completed).toBe(1);
    expect(s2.present).toBe(1);
    expect(s2.expected).toBe(s2.completed + s2.absent + s2.pending);
  });

  it("verifies attendance summary report returns correct shift1_summary string", async () => {
    const report = await getAttendanceReport({ employeeId, fromDate: "2026-08-01", toDate: "2026-08-04" });
    expect(report.items.length).toBe(1);
    const row = report.items[0];
    expect(row.shift1_summary).toBe("2 / 4");
  });
});
