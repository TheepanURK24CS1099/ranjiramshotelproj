import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import {
  calculateDailySalaryRate,
  calculateEarnedSalary,
  calculateEmployeeSalaryForPeriod,
  isFullCalendarMonth,
  roundMoney,
  FIXED_SALARY_BASIS_DAYS,
} from "../src/modules/salaries/salary-calculator.service.js";

const pool = getDatabasePool();
const marker = `salcalc-${crypto.randomUUID().slice(0, 8)}`;
let testEmployeeId = "";

describe("Salary Calculator Service (Phase 1 Refined)", () => {
  beforeAll(async () => {
    // Insert test employee
    const empRes = await pool.query(
      "INSERT INTO employees(biometric_id, name, joining_date, active) VALUES($1, $2, '2026-01-01', true) RETURNING id",
      [crypto.randomInt(900000000, 999999999), marker],
    );
    testEmployeeId = empRes.rows[0].id;

    // Insert salary history for test employee: ₹12,000/month
    await pool.query(
      `INSERT INTO employee_salary_history(employee_id, salary_type, monthly_salary, effective_from, active, notes)
       VALUES($1, 'MONTHLY', 12000, '2026-01-01', true, 'Test salary')`,
      [testEmployeeId],
    );
  });

  afterAll(async () => {
    if (testEmployeeId) {
      await pool.query("DELETE FROM employee_advance_transactions WHERE employee_id=$1", [testEmployeeId]);
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmployeeId]);
      await pool.query("DELETE FROM employee_salary_history WHERE employee_id=$1", [testEmployeeId]);
      await pool.query("DELETE FROM employees WHERE id=$1", [testEmployeeId]);
    }
  });

  it("Rule 1: ₹12,000 monthly salary yields ₹400/day daily rate", () => {
    const dailyRate = calculateDailySalaryRate(12000);
    expect(dailyRate).toBe(400);
    expect(FIXED_SALARY_BASIS_DAYS).toBe(30);
  });

  it("Rule 2: Full month capping for 31-day month (31 present days = ₹12,000, NOT ₹12,400)", () => {
    // 31 present days, 0 absent days in August (Full month)
    const earned = calculateEarnedSalary(12000, 31, 0, true);
    expect(earned).toBe(12000); // Must be capped at monthly salary ₹12,000
  });

  it("Rule 3: 31-day month with 1 absent day deducts ₹400 (₹11,600)", () => {
    // 30 present days, 1 absent day in August
    const earned = calculateEarnedSalary(12000, 30, 1, true);
    expect(earned).toBe(11600); // 12000 - (1 * 400) = 11600
  });

  it("Rule 4: Full month 28-day month with 0 absent days yields full ₹12,000", () => {
    // 28 present days, 0 absent days in Feb
    const earned = calculateEarnedSalary(12000, 28, 0, true);
    expect(earned).toBe(12000); // Full monthly salary
  });

  it("Rule 5: 28-day month with 1 absent day deducts ₹400 (₹11,600)", () => {
    // 27 present days, 1 absent day in Feb
    const earned = calculateEarnedSalary(12000, 27, 1, true);
    expect(earned).toBe(11600); // 12000 - (1 * 400) = 11600
  });

  it("Rule 6: Partial period (Aug 1 - Aug 15, 15 present days = ₹6,000)", () => {
    // Partial period uses Present Salary Days * Daily Rate
    const earned = calculateEarnedSalary(12000, 15, 0, false);
    expect(earned).toBe(6000); // 15 * 400 = 6000
  });

  it("Rule 7: Partial period (Aug 1 - Aug 15, 12 present days = ₹4,800)", () => {
    const earned = calculateEarnedSalary(12000, 12, 3, false);
    expect(earned).toBe(4800); // 12 * 400 = 4800
  });

  it("Rule 8: Helper isFullCalendarMonth detects full calendar months correctly", () => {
    expect(isFullCalendarMonth("2026-08-01", "2026-08-31")).toBe(true);
    expect(isFullCalendarMonth("2026-02-01", "2026-02-28")).toBe(true);
    expect(isFullCalendarMonth("2026-08-01", "2026-08-15")).toBe(false);
    expect(isFullCalendarMonth("2026-08-05", "2026-08-31")).toBe(false);
  });

  it("Rule 9: Late and Early-exit days earn full daily salary", () => {
    // 1 PRESENT + 1 LATE + 1 EARLY_EXIT = 3 present salary days
    const earned = calculateEarnedSalary(12000, 3, 0, false);
    expect(earned).toBe(1200); // 3 * 400 = 1200
  });

  it("Rule 10: Currency rounding works correctly for uneven divisions", () => {
    const dailyRate = calculateDailySalaryRate(10000);
    expect(dailyRate).toBe(333.33);

    // 10 present days: 10 * (10000 / 30) = 3333.33
    const earned10 = calculateEarnedSalary(10000, 10, 0, false);
    expect(earned10).toBe(3333.33);

    expect(roundMoney(108999.954)).toBe(108999.95);
  });

  it("Integration: Full monthly calculation for 31-day month (Aug 2026) with attendance & advance", async () => {
    const fromDate = "2026-08-01";
    const toDate = "2026-08-31"; // Full month (31 days)

    const bioRes = await pool.query<{ biometric_id: number }>("SELECT biometric_id FROM employees WHERE id=$1", [testEmployeeId]);
    const bio = bioRes.rows[0]?.biometric_id ?? 999000111;

    // Clean up
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmployeeId]);
    await pool.query("DELETE FROM employee_advance_transactions WHERE employee_id=$1", [testEmployeeId]);

    // Insert 31 PRESENT days
    for (let i = 1; i <= 31; i++) {
      const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmployeeId}-${dayStr}`, testEmployeeId, bio, dayStr],
      );
    }

    const adminRes = await pool.query("SELECT id FROM app_users LIMIT 1");
    const adminId = adminRes.rows[0]?.id;
    if (adminId) {
      await pool.query(
        "INSERT INTO employee_advance_transactions(employee_id, transaction_type, amount, transaction_date, notes, created_by) VALUES($1, 'ADVANCE_GIVEN', 1000, '2026-08-01', 'Test advance', $2)",
        [testEmployeeId, adminId],
      );
    }

    const result = await calculateEmployeeSalaryForPeriod(testEmployeeId, fromDate, toDate);

    expect(result.isFullMonth).toBe(true);
    expect(result.dailySalaryRate).toBe(400);
    expect(result.presentSalaryDays).toBe(31);
    expect(result.absentSalaryDays).toBe(0);
    expect(result.earnedSalary).toBe(12000); // MUST be capped at ₹12,000, not ₹12,400

    if (adminId) {
      expect(result.advanceBalance).toBe(1000);
      expect(result.netPayableSalary).toBe(11000); // 12000 - 1000 = 11000
    }
  });

  it("Integration: Mid-period salary revision calculation", async () => {
    // Create a second test employee to test mid-period salary change
    const empRes = await pool.query(
      "INSERT INTO employees(biometric_id, name, joining_date, active) VALUES($1, $2, '2026-01-01', true) RETURNING id",
      [crypto.randomInt(900000000, 999999999), `${marker}-rev`],
    );
    const revEmpId = empRes.rows[0].id;

    // Salary 1: ₹12,000/month from 2026-08-01 to 2026-08-15
    await pool.query(
      `INSERT INTO employee_salary_history(employee_id, salary_type, monthly_salary, effective_from, effective_to, active, notes)
       VALUES($1, 'MONTHLY', 12000, '2026-08-01', '2026-08-15', true, 'Period 1')`,
      [revEmpId],
    );
    // Salary 2: ₹15,000/month from 2026-08-16 onwards
    await pool.query(
      `INSERT INTO employee_salary_history(employee_id, salary_type, monthly_salary, effective_from, active, notes)
       VALUES($1, 'MONTHLY', 15000, '2026-08-16', true, 'Period 2')`,
      [revEmpId],
    );

    // Aug 1–15 (15 days at ₹400/day): 10 present days => 10 * 400 = 4,000
    for (let i = 1; i <= 10; i++) {
      const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, 999888, $3, 'PRESENT', 480)",
        [`${revEmpId}-${dayStr}`, revEmpId, dayStr],
      );
    }

    // Aug 16–31 (16 days at ₹500/day): 10 present days => 10 * 500 = 5,000
    for (let i = 16; i <= 25; i++) {
      const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, 999888, $3, 'PRESENT', 480)",
        [`${revEmpId}-${dayStr}`, revEmpId, dayStr],
      );
    }

    const result = await calculateEmployeeSalaryForPeriod(revEmpId, "2026-08-01", "2026-08-31");

    expect(result.hasSalaryRevisions).toBe(true);
    // Total earned = 4000 + 5000 = 9000
    expect(result.earnedSalary).toBe(9000);

    // Clean up second test employee
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [revEmpId]);
    await pool.query("DELETE FROM employee_salary_history WHERE employee_id=$1", [revEmpId]);
    await pool.query("DELETE FROM employees WHERE id=$1", [revEmpId]);
  });

  describe("Client Final Payroll Salary Rules (Shift-Punch Based)", () => {
    let singleEmpId: string;
    let splitEmpId: string;
    let singleShiftId: string;
    let splitShiftId: string;

    beforeAll(async () => {
      // 1. Single Shift Setup
      const sShiftRes = await pool.query(
        "INSERT INTO shifts(name, start_time, end_time, active) VALUES($1, '09:00', '18:00', true) RETURNING id",
        [`${marker}-single-shift`],
      );
      singleShiftId = sShiftRes.rows[0].id;

      const sEmpRes = await pool.query(
        "INSERT INTO employees(biometric_id, name, joining_date, active) VALUES($1, $2, '2026-01-01', true) RETURNING id",
        [crypto.randomInt(900000000, 999999999), `${marker}-single-emp`],
      );
      singleEmpId = sEmpRes.rows[0].id;

      await pool.query(
        "INSERT INTO employee_shift_assignments(employee_id, shift_id, effective_from) VALUES($1, $2, '2026-01-01')",
        [singleEmpId, singleShiftId],
      );
      await pool.query(
        "INSERT INTO employee_salary_history(employee_id, salary_type, monthly_salary, effective_from, active) VALUES($1, 'MONTHLY', 21000, '2026-01-01', true)",
        [singleEmpId],
      );

      // 2. Split (Two-Shift) Setup
      const spShiftRes = await pool.query(
        "INSERT INTO shifts(name, start_time, end_time, active) VALUES($1, '06:00', '23:30', true) RETURNING id",
        [`${marker}-split-shift`],
      );
      splitShiftId = spShiftRes.rows[0].id;

      await pool.query(
        "INSERT INTO shift_sessions(shift_id, session_number, start_time, end_time, active) VALUES($1, 1, '06:00', '14:00', true), ($1, 2, '19:00', '23:30', true)",
        [splitShiftId],
      );

      const spEmpRes = await pool.query(
        "INSERT INTO employees(biometric_id, name, joining_date, active) VALUES($1, $2, '2026-01-01', true) RETURNING id",
        [crypto.randomInt(900000000, 999999999), `${marker}-split-emp`],
      );
      splitEmpId = spEmpRes.rows[0].id;

      await pool.query(
        "INSERT INTO employee_shift_assignments(employee_id, shift_id, effective_from) VALUES($1, $2, '2026-01-01')",
        [splitEmpId, splitShiftId],
      );
      await pool.query(
        "INSERT INTO employee_salary_history(employee_id, salary_type, monthly_salary, effective_from, active) VALUES($1, 'MONTHLY', 21000, '2026-01-01', true)",
        [splitEmpId],
      );
    });

    afterAll(async () => {
      const empIds = [singleEmpId, splitEmpId].filter(Boolean);
      if (empIds.length) {
        await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = ANY($1::uuid[])", [empIds]);
        await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = ANY($1::uuid[])", [empIds]);
        await pool.query("DELETE FROM employee_salary_history WHERE employee_id = ANY($1::uuid[])", [empIds]);
        await pool.query("DELETE FROM employees WHERE id = ANY($1::uuid[])", [empIds]);
      }
      const shiftIds = [singleShiftId, splitShiftId].filter(Boolean);
      if (shiftIds.length) {
        await pool.query("DELETE FROM shift_sessions WHERE shift_id = ANY($1::uuid[])", [shiftIds]);
        await pool.query("DELETE FROM shifts WHERE id = ANY($1::uuid[])", [shiftIds]);
      }
    });

    it("1. Single shift + recognized punch -> 1.0 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [singleEmpId]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count, first_raw_punch_id)
         VALUES($1, $2, 111111, '2026-08-01', 'PRESENT', 2, 1001)`,
        [`${singleEmpId}-2026-08-01`, singleEmpId],
      );
      const res = await calculateEmployeeSalaryForPeriod(singleEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(1.0);
    });

    it("2. Single shift + no recognized punch -> 0.0 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [singleEmpId]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count)
         VALUES($1, $2, 111111, '2026-08-01', 'ABSENT', 0)`,
        [`${singleEmpId}-2026-08-01`, singleEmpId],
      );
      const res = await calculateEmployeeSalaryForPeriod(singleEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(0.0);
    });

    it("3. Single shift + punch but missing OUT -> 1.0 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [singleEmpId]);
      const sessionRecords = JSON.stringify([
        { session_number: 1, punch_in_id: 1001, punch_out_id: null, status: "MISSING_OUT" },
      ]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count, first_raw_punch_id, session_records)
         VALUES($1, $2, 111111, '2026-08-01', 'MISSING_PUNCH', 1, 1001, $3)`,
        [`${singleEmpId}-2026-08-01`, singleEmpId, sessionRecords],
      );
      const res = await calculateEmployeeSalaryForPeriod(singleEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(1.0);
    });

    it("4. Single shift + late punch -> 1.0 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [singleEmpId]);
      const sessionRecords = JSON.stringify([
        { session_number: 1, punch_in_id: 1001, punch_out_id: 1002, status: "LATE" },
      ]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count, first_raw_punch_id, session_records)
         VALUES($1, $2, 111111, '2026-08-01', 'LATE', 2, 1001, $3)`,
        [`${singleEmpId}-2026-08-01`, singleEmpId, sessionRecords],
      );
      const res = await calculateEmployeeSalaryForPeriod(singleEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(1.0);
    });

    it("5. Single shift + early exit -> 1.0 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [singleEmpId]);
      const sessionRecords = JSON.stringify([
        { session_number: 1, punch_in_id: 1001, punch_out_id: 1002, status: "EARLY_EXIT" },
      ]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count, first_raw_punch_id, session_records)
         VALUES($1, $2, 111111, '2026-08-01', 'EARLY_EXIT', 2, 1001, $3)`,
        [`${singleEmpId}-2026-08-01`, singleEmpId, sessionRecords],
      );
      const res = await calculateEmployeeSalaryForPeriod(singleEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(1.0);
    });

    it("6. Two shifts + both punched -> 1.0 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [splitEmpId]);
      const sessionRecords = JSON.stringify([
        { session_number: 1, punch_in_id: 2001, punch_out_id: 2002, status: "COMPLETED" },
        { session_number: 2, punch_in_id: 2003, punch_out_id: 2004, status: "COMPLETED" },
      ]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count, session_records)
         VALUES($1, $2, 222222, '2026-08-01', 'PRESENT', 4, $3)`,
        [`${splitEmpId}-2026-08-01`, splitEmpId, sessionRecords],
      );
      const res = await calculateEmployeeSalaryForPeriod(splitEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(1.0);
    });

    it("7. Two shifts + only Shift 1 punched -> 0.5 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [splitEmpId]);
      const sessionRecords = JSON.stringify([
        { session_number: 1, punch_in_id: 2001, punch_out_id: 2002, status: "COMPLETED" },
        { session_number: 2, punch_in_id: null, punch_out_id: null, status: "CHECK_IN_MISSING" },
      ]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count, session_records)
         VALUES($1, $2, 222222, '2026-08-01', 'HALF_DAY', 2, $3)`,
        [`${splitEmpId}-2026-08-01`, splitEmpId, sessionRecords],
      );
      const res = await calculateEmployeeSalaryForPeriod(splitEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(0.5);
    });

    it("8. Two shifts + only Shift 2 punched -> 0.5 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [splitEmpId]);
      const sessionRecords = JSON.stringify([
        { session_number: 1, punch_in_id: null, punch_out_id: null, status: "CHECK_IN_MISSING" },
        { session_number: 2, punch_in_id: 2003, punch_out_id: 2004, status: "COMPLETED" },
      ]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count, session_records)
         VALUES($1, $2, 222222, '2026-08-01', 'HALF_DAY', 2, $3)`,
        [`${splitEmpId}-2026-08-01`, splitEmpId, sessionRecords],
      );
      const res = await calculateEmployeeSalaryForPeriod(splitEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(0.5);
    });

    it("9. Two shifts + neither punched -> 0.0 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [splitEmpId]);
      const sessionRecords = JSON.stringify([
        { session_number: 1, punch_in_id: null, punch_out_id: null, status: "CHECK_IN_MISSING" },
        { session_number: 2, punch_in_id: null, punch_out_id: null, status: "CHECK_IN_MISSING" },
      ]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count, session_records)
         VALUES($1, $2, 222222, '2026-08-01', 'ABSENT', 0, $3)`,
        [`${splitEmpId}-2026-08-01`, splitEmpId, sessionRecords],
      );
      const res = await calculateEmployeeSalaryForPeriod(splitEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(0.0);
    });

    it("10. Two shifts + one shift missing OUT -> 0.5 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [splitEmpId]);
      const sessionRecords = JSON.stringify([
        { session_number: 1, punch_in_id: 2001, punch_out_id: null, status: "MISSING_OUT" },
        { session_number: 2, punch_in_id: null, punch_out_id: null, status: "CHECK_IN_MISSING" },
      ]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count, session_records)
         VALUES($1, $2, 222222, '2026-08-01', 'MISSING_PUNCH', 1, $3)`,
        [`${splitEmpId}-2026-08-01`, splitEmpId, sessionRecords],
      );
      const res = await calculateEmployeeSalaryForPeriod(splitEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(0.5);
    });

    it("13. Weekly off -> 1.0 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [singleEmpId]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count)
         VALUES($1, $2, 111111, '2026-08-01', 'WEEKLY_OFF', 0)`,
        [`${singleEmpId}-2026-08-01`, singleEmpId],
      );
      const res = await calculateEmployeeSalaryForPeriod(singleEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(1.0);
    });

    it("14. Holiday -> 1.0 payable day", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [singleEmpId]);
      await pool.query(
        `INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, raw_punch_count)
         VALUES($1, $2, 111111, '2026-08-01', 'HOLIDAY', 0)`,
        [`${singleEmpId}-2026-08-01`, singleEmpId],
      );
      const res = await calculateEmployeeSalaryForPeriod(singleEmpId, "2026-08-01", "2026-08-01");
      expect(res.presentSalaryDays).toBe(1.0);
    });
  });
});

