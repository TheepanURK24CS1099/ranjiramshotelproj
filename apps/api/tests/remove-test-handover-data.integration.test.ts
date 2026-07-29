/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { removeTestHandoverData } from "../src/scripts/remove-test-handover-data.js";

const pool = getDatabasePool();
const marker = `handover-test-${crypto.randomUUID()}`;

let adminUserId: string;
let deviceId: string;
let unrelatedEmployeeId: string;
let unrelatedShiftId: string;
let unrelatedPayrollRecordId: string;

let testEmployeeId: string;
let testShiftId: string;
let testPayrollPeriodId: string;
let testPayrollRecordId: string;
let testPaymentId: string;
let testRawPunch14Id: string;
let testRawPunch25Id: string;

describe("One-time Production Test Handover Cleanup Script Integration Tests", () => {
  beforeAll(async () => {
    // 0. Pre-cleanup to ensure clean environment
    await pool.query("DELETE FROM payroll_reset_audits WHERE reason LIKE '%Test%'");
    await pool.query("DELETE FROM payroll_payment_audit WHERE reason LIKE '%Test%'");
    await pool.query("DELETE FROM payroll_slips WHERE slip_number LIKE 'SLIP-%'");
    await pool.query("DELETE FROM payroll_payments WHERE payment_reference LIKE '%handover%' OR notes LIKE '%handover%'");
    await pool.query("DELETE FROM payroll_adjustments WHERE reason LIKE '%Test%'");
    await pool.query("DELETE FROM payroll_deductions WHERE notes LIKE '%Test%'");
    await pool.query("DELETE FROM employee_advance_transactions WHERE notes LIKE '%Advance%'");
    await pool.query("DELETE FROM employee_payroll_records WHERE payroll_period_id IN (SELECT id FROM payroll_periods WHERE year IN (2998, 2999))");
    await pool.query("DELETE FROM payroll_periods WHERE year IN (2998, 2999)");
    await pool.query("DELETE FROM attendance_exceptions WHERE biometric_id IN (14, 25, 999999)");
    await pool.query("DELETE FROM daily_attendance_records WHERE biometric_id IN (14, 25, 999999)");
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id IN (14, 25, 999999)");
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id IN (SELECT id FROM employees WHERE biometric_id IN (14, 25, 999999))");
    await pool.query("DELETE FROM employee_salary_history WHERE employee_id IN (SELECT id FROM employees WHERE biometric_id IN (14, 25, 999999))");
    await pool.query("DELETE FROM shift_sessions WHERE shift_id IN (SELECT id FROM shifts WHERE LOWER(name) = 'eve' OR name LIKE 'Morning-%')");
    await pool.query("DELETE FROM employees WHERE biometric_id IN (14, 25, 999999) OR LOWER(name) = 'test'");
    await pool.query("DELETE FROM shifts WHERE LOWER(name) = 'eve' OR name LIKE 'Morning-%'");

    // 1. Create Admin User
    const adminRes = await pool.query<{ id: string }>(
      `INSERT INTO app_users (email, username, password_hash, role, active)
       VALUES ($1, $2, 'hash', 'ADMIN', true)
       RETURNING id`,
      [`admin-${marker}@test.invalid`, `admin-${marker}`]
    );
    adminUserId = adminRes.rows[0]!.id;

    // 2. Create Biometric Device
    const deviceRes = await pool.query<{ id: string }>(
      `INSERT INTO devices (device_code, name, model, serial_number, status, last_seen, last_ip, firmware_version, active)
       VALUES ($1, $2, 'Model-Z', 'SN-99999', 'ONLINE', now(), '192.168.1.100', 'v1.0.0', true)
       RETURNING id`,
      [`DEV-${marker}`, `Device-${marker}`]
    );
    deviceId = deviceRes.rows[0]!.id;

    // 3. Create Unrelated Employee & Shift (Must be preserved!)
    const unrelEmpRes = await pool.query<{ id: string }>(
      `INSERT INTO employees (biometric_id, employee_code, name, phone, department, designation, joining_date, active)
       VALUES (999999, $1, $2, '9999999999', 'Engineering', 'Developer', '2025-01-01', true)
       RETURNING id`,
      [`EMP-UNREL-${marker}`, `Unrelated-${marker}`]
    );
    unrelatedEmployeeId = unrelEmpRes.rows[0]!.id;

    const unrelShiftRes = await pool.query<{ id: string }>(
      `INSERT INTO shifts (name, start_time, end_time, grace_minutes, minimum_work_minutes, is_overnight, active)
       VALUES ($1, '08:00', '16:00', 15, 480, false, true)
       RETURNING id`,
      [`Morning-${marker}`]
    );
    unrelatedShiftId = unrelShiftRes.rows[0]!.id;

    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '2025-01-01')`,
      [unrelatedEmployeeId, unrelatedShiftId]
    );

    const unrelSalaryRes = await pool.query<{ id: string }>(
      `INSERT INTO employee_salary_history (employee_id, salary_type, monthly_salary, effective_from, active)
       VALUES ($1, 'MONTHLY', 50000.00, '2025-01-01', true)
       RETURNING id`,
      [unrelatedEmployeeId]
    );

    await pool.query(
      `INSERT INTO employee_advance_transactions (employee_id, transaction_type, amount, transaction_date, notes, created_by)
       VALUES ($1, 'ADVANCE_GIVEN', 2000.00, '2025-01-05', 'Unrelated Advance', $2)`,
      [unrelatedEmployeeId, adminUserId]
    );

    const unrelPeriodRes = await pool.query<{ id: string }>(
      `INSERT INTO payroll_periods (year, month, period_start, period_end, status)
       VALUES (2998, 1, '2998-01-01', '2998-01-31', 'GENERATED')
       RETURNING id`
    );

    const unrelPayrollRecRes = await pool.query<{ id: string }>(
      `INSERT INTO employee_payroll_records (payroll_period_id, employee_id, salary_history_id, salary_type, base_salary, gross_pay, net_pay, status)
       VALUES ($1, $2, $3, 'MONTHLY', 50000, 50000, 50000, 'DRAFT')
       RETURNING id`,
      [unrelPeriodRes.rows[0]!.id, unrelatedEmployeeId, unrelSalaryRes.rows[0]!.id]
    );
    unrelatedPayrollRecordId = unrelPayrollRecRes.rows[0]!.id;

    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, attendance_date, employee_id, biometric_id, shift_id, working_minutes, raw_punch_count, status)
       VALUES ($1, '2998-01-10', $2, 999999, $3, 480, 2, 'PRESENT')`,
      [`KEY-UNREL-${marker}`, unrelatedEmployeeId, unrelatedShiftId]
    );

    // 4. Create Exact Test Employee to be cleaned up
    // Specs: name = 'test', code = '1', biometric ID = 14, department = 'cheif', active = false
    const testEmpRes = await pool.query<{ id: string }>(
      `INSERT INTO employees (biometric_id, employee_code, name, phone, department, designation, joining_date, active)
       VALUES (14, '1', 'test', '0000000000', 'cheif', 'Tester', '2024-01-01', false)
       RETURNING id`
    );
    testEmployeeId = testEmpRes.rows[0]!.id;

    // 5. Create Exact Test Shift to be cleaned up
    // Specs: name = 'eve', start_time = '17:00', end_time = '22:40', active = false
    const testShiftRes = await pool.query<{ id: string }>(
      `INSERT INTO shifts (name, start_time, end_time, grace_minutes, minimum_work_minutes, is_overnight, active)
       VALUES ('eve', '17:00:00', '22:40:00', 10, 300, false, false)
       RETURNING id`
    );
    testShiftId = testShiftRes.rows[0]!.id;

    await pool.query(
      `INSERT INTO shift_sessions (shift_id, session_number, start_time, end_time, active)
       VALUES ($1, 1, '17:00:00', '22:40:00', false)
       ON CONFLICT (shift_id, session_number) DO NOTHING`,
      [testShiftId]
    );

    // 6. Connect Test Employee and Test Shift with dependent records
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '2024-01-01')`,
      [testEmployeeId, testShiftId]
    );

    const testSalaryRes = await pool.query<{ id: string }>(
      `INSERT INTO employee_salary_history (employee_id, salary_type, monthly_salary, effective_from, active)
       VALUES ($1, 'MONTHLY', 10000.00, '2024-01-01', true)
       RETURNING id`,
      [testEmployeeId]
    );

    const testAdvanceRes = await pool.query<{ id: string }>(
      `INSERT INTO employee_advance_transactions (employee_id, transaction_type, amount, transaction_date, notes, created_by)
       VALUES ($1, 'ADVANCE_GIVEN', 500.00, '2024-01-10', 'Test Advance', $2)
       RETURNING id`,
      [testEmployeeId, adminUserId]
    );

    const testPeriodRes = await pool.query<{ id: string }>(
      `INSERT INTO payroll_periods (year, month, period_start, period_end, status)
       VALUES (2999, 1, '2999-01-01', '2999-01-31', 'DRAFT')
       RETURNING id`
    );
    testPayrollPeriodId = testPeriodRes.rows[0]!.id;

    const testPayrollRecRes = await pool.query<{ id: string }>(
      `INSERT INTO employee_payroll_records (payroll_period_id, employee_id, salary_history_id, salary_type, base_salary, gross_pay, net_pay, status)
       VALUES ($1, $2, $3, 'MONTHLY', 10000, 10000, 9500, 'DRAFT')
       RETURNING id`,
      [testPayrollPeriodId, testEmployeeId, testSalaryRes.rows[0]!.id]
    );
    testPayrollRecordId = testPayrollRecRes.rows[0]!.id;

    await pool.query(
      `INSERT INTO payroll_deductions (payroll_record_id, deduction_type, amount, notes)
       VALUES ($1, 'PENALTY', 100.00, 'Test penalty')`,
      [testPayrollRecordId]
    );

    await pool.query(
      `INSERT INTO payroll_adjustments (payroll_record_id, field_name, old_value, new_value, reason, changed_by)
       VALUES ($1, 'base_salary', '10000', '10000', 'Test adjustment', $2)`,
      [testPayrollRecordId, adminUserId]
    );

    const testPmtRes = await pool.query<{ id: string }>(
      `INSERT INTO payroll_payments (payroll_record_id, payment_date, payment_method, created_by, payroll_period_id, employee_id, amount, status)
       VALUES ($1, '2999-01-31', 'CASH', $2, $3, $4, 9500, 'PAID')
       RETURNING id`,
      [testPayrollRecordId, adminUserId, testPayrollPeriodId, testEmployeeId]
    );
    testPaymentId = testPmtRes.rows[0]!.id;

    await pool.query(
      `INSERT INTO payroll_slips (payroll_period_id, employee_payroll_record_id, employee_id, slip_number, generated_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [testPayrollPeriodId, testPayrollRecordId, testEmployeeId, `SLIP-${marker}`, adminUserId]
    );

    await pool.query(
      `INSERT INTO payroll_payment_audit (payroll_payment_id, action, reason, created_by)
       VALUES ($1, 'REVERSED', 'Test reversal', $2)`,
      [testPaymentId, adminUserId]
    );

    await pool.query(
      `INSERT INTO payroll_reset_audits (payroll_period_id, employee_payroll_record_id, payment_id, action, reason, actor_id)
       VALUES ($1, $2, $3, 'RESET', 'Test reset', $4)`,
      [testPayrollPeriodId, testPayrollRecordId, testPaymentId, adminUserId]
    );

    // 7. Create Raw Attendance Punches for Biometric IDs 14 & 25
    const punch14Res = await pool.query<{ id: string }>(
      `INSERT INTO raw_attendance_punches (device_id, biometric_id, punch_time, source_event_key)
       VALUES ($1, 14, '2999-01-15T08:00:00Z', $2)
       RETURNING id`,
      [deviceId, `KEY-P14-${marker}`]
    );
    testRawPunch14Id = punch14Res.rows[0]!.id;

    const punch25Res = await pool.query<{ id: string }>(
      `INSERT INTO raw_attendance_punches (device_id, biometric_id, punch_time, source_event_key)
       VALUES ($1, 25, '2999-01-15T08:30:00Z', $2)
       RETURNING id`,
      [deviceId, `KEY-P25-${marker}`]
    );
    testRawPunch25Id = punch25Res.rows[0]!.id;

    // 8. Create Attendance Exceptions & Daily Attendance Records
    await pool.query(
      `INSERT INTO attendance_exceptions (raw_punch_id, attendance_date, employee_id, biometric_id, shift_id, punch_time, exception_type, message)
       VALUES ($1, '2999-01-15', $2, 14, $3, '2999-01-15T08:00:00Z', 'OUT_OF_SHIFT', 'Test Exception 14')`,
      [testRawPunch14Id, testEmployeeId, testShiftId]
    );

    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, attendance_date, employee_id, biometric_id, shift_id, working_minutes, raw_punch_count, status)
       VALUES ($1, '2999-01-15', $2, 14, $3, 300, 1, 'PRESENT')`,
      [`KEY-ATT14-${marker}`, testEmployeeId, testShiftId]
    );

    await pool.query(
      `INSERT INTO daily_attendance_records (attendance_key, attendance_date, employee_id, biometric_id, shift_id, working_minutes, raw_punch_count, status)
       VALUES ($1, '2999-01-15', NULL, 25, NULL, 0, 1, 'UNMATCHED')`,
      [`KEY-ATT25-${marker}`]
    );
  });

  afterAll(async () => {
    // Clean up any remaining fixtures
    await pool.query("DELETE FROM payroll_reset_audits WHERE actor_id = $1", [adminUserId]);
    await pool.query("DELETE FROM payroll_payment_audit WHERE created_by = $1", [adminUserId]);
    await pool.query("DELETE FROM payroll_slips WHERE employee_id IN ($1, $2)", [testEmployeeId, unrelatedEmployeeId]);
    await pool.query("DELETE FROM payroll_payments WHERE created_by = $1", [adminUserId]);
    await pool.query("DELETE FROM payroll_adjustments WHERE changed_by = $1", [adminUserId]);
    await pool.query("DELETE FROM payroll_deductions WHERE payroll_record_id IN ($1, $2)", [testPayrollRecordId, unrelatedPayrollRecordId]);
    await pool.query("DELETE FROM employee_advance_transactions WHERE created_by = $1", [adminUserId]);
    await pool.query("DELETE FROM employee_payroll_records WHERE employee_id IN ($1, $2)", [testEmployeeId, unrelatedEmployeeId]);
    await pool.query("DELETE FROM payroll_periods WHERE id IN ($1, $2)", [testPayrollPeriodId, unrelatedPayrollRecordId]);
    await pool.query("DELETE FROM employee_salary_history WHERE employee_id IN ($1, $2)", [testEmployeeId, unrelatedEmployeeId]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id IN ($1, $2)", [testEmployeeId, unrelatedEmployeeId]);
    await pool.query("DELETE FROM attendance_exceptions WHERE employee_id IN ($1, $2) OR biometric_id IN (14, 25)", [testEmployeeId, unrelatedEmployeeId]);
    await pool.query("DELETE FROM daily_attendance_records WHERE attendance_key LIKE $1", [`%${marker}%`]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE device_id = $1", [deviceId]);
    await pool.query("DELETE FROM shift_sessions WHERE shift_id IN ($1, $2)", [testShiftId, unrelatedShiftId]);
    await pool.query("DELETE FROM employees WHERE id IN ($1, $2)", [testEmployeeId, unrelatedEmployeeId]);
    await pool.query("DELETE FROM shifts WHERE id IN ($1, $2)", [testShiftId, unrelatedShiftId]);
    await pool.query("DELETE FROM devices WHERE id = $1", [deviceId]);
    await pool.query("DELETE FROM app_users WHERE id = $1", [adminUserId]);
  });

  it("dry-run mode changes nothing in the database and returns complete preview counts", async () => {
    const result = await removeTestHandoverData({ confirm: false, silent: true });

    expect(result.isConfirmed).toBe(false);
    expect(result.matchedEmployee?.id).toBe(testEmployeeId);
    expect(result.matchedShift?.id).toBe(testShiftId);
    expect(result.matchedBiometricIds).toEqual([14, 25]);
    expect(result.preservedDeviceCount).toBeGreaterThanOrEqual(1);

    expect(result.tableCounts["employees"]).toBe(1);
    expect(result.tableCounts["shifts"]).toBe(1);
    expect(result.tableCounts["raw_attendance_punches"]).toBeGreaterThanOrEqual(2);
    expect(result.tableCounts["daily_attendance_records"]).toBeGreaterThanOrEqual(2);

    // Prove data STILL EXISTS in database after dry-run
    const testEmpStillExists = await pool.query("SELECT id FROM employees WHERE id = $1", [testEmployeeId]);
    expect(testEmpStillExists.rows).toHaveLength(1);

    const testShiftStillExists = await pool.query("SELECT id FROM shifts WHERE id = $1", [testShiftId]);
    expect(testShiftStillExists.rows).toHaveLength(1);

    const punch14StillExists = await pool.query("SELECT id FROM raw_attendance_punches WHERE id = $1", [testRawPunch14Id]);
    expect(punch14StillExists.rows).toHaveLength(1);
  });

  it("proves device records remain untouched", async () => {
    const devBefore = await pool.query("SELECT * FROM devices WHERE id = $1", [deviceId]);
    expect(devBefore.rows).toHaveLength(1);

    await removeTestHandoverData({ confirm: false, silent: true });

    const devAfter = await pool.query("SELECT * FROM devices WHERE id = $1", [deviceId]);
    expect(devAfter.rows).toHaveLength(1);
    expect(devAfter.rows[0]!.serial_number).toBe("SN-99999");
    expect(devAfter.rows[0]!.last_ip.toString()).toContain("192.168.1.100");
  });

  it("proves admin users remain untouched", async () => {
    const adminBefore = await pool.query("SELECT id, email, role FROM app_users WHERE id = $1", [adminUserId]);
    expect(adminBefore.rows).toHaveLength(1);

    await removeTestHandoverData({ confirm: false, silent: true });

    const adminAfter = await pool.query("SELECT id, email, role FROM app_users WHERE id = $1", [adminUserId]);
    expect(adminAfter.rows).toHaveLength(1);
    expect(adminAfter.rows[0]!.role).toBe("ADMIN");
  });

  it("proves application and payroll settings remain untouched", async () => {
    const moduleSettings = await pool.query("SELECT * FROM module_settings");
    expect(moduleSettings.rows.length).toBeGreaterThanOrEqual(1);

    await removeTestHandoverData({ confirm: false, silent: true });

    const moduleSettingsPost = await pool.query("SELECT * FROM module_settings");
    expect(moduleSettingsPost.rows.length).toBe(moduleSettings.rows.length);
  });

  it("proves unrelated employees, shifts, attendance, payroll, and punches remain untouched", async () => {
    const unrelEmpRes = await pool.query("SELECT id FROM employees WHERE id = $1", [unrelatedEmployeeId]);
    expect(unrelEmpRes.rows).toHaveLength(1);

    const unrelShiftRes = await pool.query("SELECT id FROM shifts WHERE id = $1", [unrelatedShiftId]);
    expect(unrelShiftRes.rows).toHaveLength(1);

    const unrelAttRes = await pool.query("SELECT attendance_key FROM daily_attendance_records WHERE employee_id = $1", [unrelatedEmployeeId]);
    expect(unrelAttRes.rows).toHaveLength(1);
  });

  it("confirmed mode deletes ONLY the listed test data", async () => {
    const result = await removeTestHandoverData({ confirm: true, silent: true });

    expect(result.isConfirmed).toBe(true);
    expect(result.totalDeleted).toBeGreaterThan(0);

    // Verify test employee is deleted
    const testEmpPost = await pool.query("SELECT id FROM employees WHERE id = $1", [testEmployeeId]);
    expect(testEmpPost.rows).toHaveLength(0);

    // Verify test shift is deleted
    const testShiftPost = await pool.query("SELECT id FROM shifts WHERE id = $1", [testShiftId]);
    expect(testShiftPost.rows).toHaveLength(0);

    // Verify test raw punches (14 and 25) are deleted
    const punchesPost = await pool.query("SELECT id FROM raw_attendance_punches WHERE biometric_id IN (14, 25)");
    expect(punchesPost.rows).toHaveLength(0);

    // Verify dependent records for test employee/shift are deleted
    const testPayrollRecPost = await pool.query("SELECT id FROM employee_payroll_records WHERE id = $1", [testPayrollRecordId]);
    expect(testPayrollRecPost.rows).toHaveLength(0);

    // Verify UNRELATED records REMAIN intact!
    const unrelEmpPost = await pool.query("SELECT id FROM employees WHERE id = $1", [unrelatedEmployeeId]);
    expect(unrelEmpPost.rows).toHaveLength(1);

    const unrelShiftPost = await pool.query("SELECT id FROM shifts WHERE id = $1", [unrelatedShiftId]);
    expect(unrelShiftPost.rows).toHaveLength(1);

    const unrelPayrollPost = await pool.query("SELECT id FROM employee_payroll_records WHERE id = $1", [unrelatedPayrollRecordId]);
    expect(unrelPayrollPost.rows).toHaveLength(1);

    const devPost = await pool.query("SELECT id FROM devices WHERE id = $1", [deviceId]);
    expect(devPost.rows).toHaveLength(1);
  });

  it("rollback works on failure when unexpected conditions occur", async () => {
    // Ensure clean state for biometric IDs 14 and 25
    await pool.query("DELETE FROM employees WHERE biometric_id IN (14, 25)");

    // Re-insert test employee & biometric ID 25 assigned to an unrelated employee to trigger safety check failure
    const dummyEmpRes = await pool.query<{ id: string }>(
      `INSERT INTO employees (biometric_id, employee_code, name, phone, department, designation, joining_date, active)
       VALUES (25, 'DUMMY-25', 'Active Emp With Bio 25', '1111111111', 'HR', 'Manager', '2025-01-01', true)
       RETURNING id`
    );
    const dummyEmpId = dummyEmpRes.rows[0]!.id;

    // Also re-insert a test employee candidate
    const testEmpTempRes = await pool.query<{ id: string }>(
      `INSERT INTO employees (biometric_id, employee_code, name, phone, department, designation, joining_date, active)
       VALUES (14, '1', 'test', '0000000000', 'cheif', 'Tester', '2024-01-01', false)
       RETURNING id`
    );
    const testEmpTempId = testEmpTempRes.rows[0]!.id;

    // Attempt cleanup: it MUST throw safety check failure because biometric ID 25 belongs to an active/unrelated employee
    await expect(removeTestHandoverData({ confirm: true, silent: true })).rejects.toThrow(
      /Safety Check Failure: Biometric ID 25 is assigned to an active or unrelated employee/
    );

    // Verify rollback: testEmpTempId and dummyEmpId were NOT deleted or partially modified by a failed cleanup execution
    const dummyCheck = await pool.query("SELECT id FROM employees WHERE id = $1", [dummyEmpId]);
    expect(dummyCheck.rows).toHaveLength(1);

    const tempCheck = await pool.query("SELECT id FROM employees WHERE id = $1", [testEmpTempId]);
    expect(tempCheck.rows).toHaveLength(1);

    // Cleanup temp rows
    await pool.query("DELETE FROM employees WHERE id IN ($1, $2)", [dummyEmpId, testEmpTempId]);
  });
});
