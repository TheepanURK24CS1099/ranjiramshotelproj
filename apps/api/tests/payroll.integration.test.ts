import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { createPeriod, generate, recalculate, listRecords, updateRecord } from "../src/modules/payroll/payroll.service.js";

const pool = getDatabasePool();

describe("Phase 2D: Payroll Integration With Salary Calculator", () => {
  const marker = `payroll-test-${Date.now()}`;
  let adminId: string;
  let testEmpId: string;
  let bio: number;

  beforeAll(async () => {
    await pool.query("DELETE FROM payroll_deductions WHERE payroll_record_id IN (SELECT id FROM employee_payroll_records WHERE payroll_period_id IN (SELECT id FROM payroll_periods WHERE year=2999))");
    await pool.query("DELETE FROM employee_advance_transactions WHERE payroll_record_id IN (SELECT id FROM employee_payroll_records WHERE payroll_period_id IN (SELECT id FROM payroll_periods WHERE year=2999))");
    await pool.query("DELETE FROM employee_payroll_records WHERE payroll_period_id IN (SELECT id FROM payroll_periods WHERE year=2999)");
    await pool.query("UPDATE payroll_periods SET generated_by=NULL,approved_by=NULL,paid_by=NULL,locked_by=NULL WHERE year=2999");
    await pool.query("DELETE FROM payroll_periods WHERE year=2999");

    adminId = (
      await pool.query(
        "INSERT INTO app_users(username, email, password_hash, role) VALUES($1, $2, 'hash', 'ADMIN') RETURNING id",
        [`admin-${marker}`, `admin-${marker}@test.com`],
      )
    ).rows[0].id;

    bio = crypto.randomInt(710000000, 799000000);
    testEmpId = (
      await pool.query(
        "INSERT INTO employees(biometric_id, name, joining_date, active) VALUES($1, 'Payroll Test Emp', '2026-01-01', true) RETURNING id",
        [bio],
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM payroll_deductions WHERE payroll_record_id IN (SELECT id FROM employee_payroll_records WHERE employee_id=$1)", [testEmpId]);
    await pool.query("DELETE FROM employee_advance_transactions WHERE employee_id=$1 OR employee_id IN (SELECT id FROM employees WHERE name LIKE $2)", [testEmpId, `%${marker}%`]);
    await pool.query("DELETE FROM employee_payroll_records WHERE employee_id=$1 OR payroll_period_id IN (SELECT id FROM payroll_periods WHERE notes LIKE $2 OR year = 2999)", [testEmpId, `%${marker}%`]);
    await pool.query("DELETE FROM employee_salary_history WHERE employee_id=$1", [testEmpId]);
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
    await pool.query(
      "DELETE FROM payroll_periods WHERE notes LIKE $1 OR year = 2999",
      [`%${marker}%`],
    );
    await pool.query("DELETE FROM employees WHERE id=$1", [testEmpId]);
    await pool.query("DELETE FROM app_users WHERE id=$1", [adminId]);
  });


  it("Test 1: 31-day full month with 31 present days yields ₹12,000 (NOT ₹12,400)", async () => {
    await pool.query("DELETE FROM employee_salary_history WHERE employee_id=$1", [testEmpId]);
    await pool.query(
      "INSERT INTO employee_salary_history(employee_id, salary_type, monthly_salary, effective_from, active) VALUES($1, 'MONTHLY', 12000, '2026-01-01', true)",
      [testEmpId],
    );

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
    for (let i = 1; i <= 31; i++) {
      const dayStr = `2999-08-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }

    const period = await createPeriod({ year: 2999, month: 8, notes: marker }, adminId);
    await generate(period.id, adminId);
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toBeTruthy();
    expect(Number(rec.base_salary)).toBe(12000);
    expect(Number(rec.gross_pay)).toBe(12000);
    expect(Number(rec.attendance_deduction)).toBe(0);
    expect(Number(rec.net_pay)).toBe(12000);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
  });

  it("Test 2: 31-day month with 30 present days and 1 absent day yields ₹11,600", async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
    for (let i = 1; i <= 30; i++) {
      const dayStr = `2999-07-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }
    await pool.query(
      "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, '2999-07-31', 'ABSENT', 0)",
      [`${testEmpId}-2999-07-31`, testEmpId, bio],
    );

    const period = await createPeriod({ year: 2999, month: 7, notes: marker }, adminId);
    await generate(period.id, adminId);
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toBeTruthy();
    expect(Number(rec.base_salary)).toBe(12000);
    expect(Number(rec.attendance_deduction)).toBe(400);
    expect(Number(rec.net_pay)).toBe(11600);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
  });

  it("Test 3: LATE days receive full daily salary without deduction", async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
    for (let i = 1; i <= 5; i++) {
      const dayStr = `2999-06-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'LATE', 450)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }
    for (let i = 6; i <= 30; i++) {
      const dayStr = `2999-06-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }

    const period = await createPeriod({ year: 2999, month: 6, notes: marker }, adminId);
    await generate(period.id, adminId);
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toBeTruthy();
    expect(Number(rec.attendance_deduction)).toBe(0);
    expect(Number(rec.net_pay)).toBe(12000);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
  });

  it("Test 4: EARLY_EXIT days receive full daily salary without deduction", async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
    for (let i = 1; i <= 5; i++) {
      const dayStr = `2999-05-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'EARLY_EXIT', 430)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }
    for (let i = 6; i <= 31; i++) {
      const dayStr = `2999-05-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }

    const period = await createPeriod({ year: 2999, month: 5, notes: marker }, adminId);
    await generate(period.id, adminId);
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toBeTruthy();
    expect(Number(rec.attendance_deduction)).toBe(0);
    expect(Number(rec.net_pay)).toBe(12000);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
  });

  it("Test 5: HALF_DAY contributes 0.5 salary day (deducts ₹200 for ₹12,000 salary)", async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
    for (let i = 1; i <= 30; i++) {
      const dayStr = `2999-04-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }
    // 30 days present in 30-day month = full month salary (12000). If 1 is half day:
    await pool.query("DELETE FROM daily_attendance_records WHERE attendance_key=$1", [`${testEmpId}-2999-04-30`]);
    await pool.query(
      "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, '2999-04-30', 'HALF_DAY', 240)",
      [`${testEmpId}-2999-04-30`, testEmpId, bio],
    );

    const period = await createPeriod({ year: 2999, month: 4, notes: marker }, adminId);
    await generate(period.id, adminId);
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toBeTruthy();
    expect(Number(rec.attendance_deduction)).toBe(200);
    expect(Number(rec.net_pay)).toBe(11800);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
  });

  it("Test 6: ABSENT contributes 0 salary day (deducts ₹400 per absent day)", async () => {
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
    for (let i = 1; i <= 28; i++) {
      const dayStr = `2999-03-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }
    for (let i = 29; i <= 31; i++) {
      const dayStr = `2999-03-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'ABSENT', 0)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }

    const period = await createPeriod({ year: 2999, month: 3, notes: marker }, adminId);
    await generate(period.id, adminId);
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toBeTruthy();
    expect(Number(rec.absent_days)).toBe(3);
    expect(Number(rec.attendance_deduction)).toBe(1200);
    expect(Number(rec.net_pay)).toBe(10800);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
  });

  it("Test 7: Advance recovery reduces net pay", async () => {
    await pool.query(
      "INSERT INTO employee_advance_transactions(employee_id, transaction_type, amount, transaction_date, notes, created_by) VALUES($1, 'ADVANCE_GIVEN', 2000, '2999-02-01', $2, $3)",
      [testEmpId, `${marker}-adv`, adminId],
    );
    for (let i = 1; i <= 28; i++) {
      const dayStr = `2999-02-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }

    const period = await createPeriod({ year: 2999, month: 2, notes: marker }, adminId);
    await generate(period.id, adminId);
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toBeTruthy();
    expect(Number(rec.gross_pay)).toBe(12000);
    expect(Number(rec.advance_recovery)).toBe(2000);
    expect(Number(rec.net_pay)).toBe(10000);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
  });

  it("Test 8: Large advance recovery cannot make net pay negative", async () => {
    await pool.query(
      "INSERT INTO employee_advance_transactions(employee_id, transaction_type, amount, transaction_date, notes, created_by) VALUES($1, 'ADVANCE_GIVEN', 20000, '2999-01-01', $2, $3)",
      [testEmpId, `${marker}-big-adv`, adminId],
    );
    for (let i = 1; i <= 31; i++) {
      const dayStr = `2999-01-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }

    const period = await createPeriod({ year: 2999, month: 1, notes: marker }, adminId);
    await generate(period.id, adminId);
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toBeTruthy();
    expect(Number(rec.gross_pay)).toBe(12000);
    expect(Number(rec.advance_recovery)).toBe(12000); // capped by gross pay
    expect(Number(rec.net_pay)).toBe(0);
  });


  it("Test 9: Recalculation consistency produces identical results", async () => {
    const period = (await pool.query("SELECT * FROM payroll_periods WHERE year=2999 AND month=1 AND notes=$1", [marker])).rows[0];
    expect(period).toBeTruthy();

    const recordsBefore = await listRecords(period.id);
    const recBefore = recordsBefore.find((r) => r.employee_id === testEmpId);

    await recalculate(period.id, adminId);

    const recordsAfter = await listRecords(period.id);
    const recAfter = recordsAfter.find((r) => r.employee_id === testEmpId);

    expect(Number(recAfter.gross_pay)).toBe(Number(recBefore.gross_pay));
    expect(Number(recAfter.attendance_deduction)).toBe(Number(recBefore.attendance_deduction));
    expect(Number(recAfter.advance_recovery)).toBe(Number(recBefore.advance_recovery));
    expect(Number(recAfter.net_pay)).toBe(Number(recBefore.net_pay));
  });

  it("Test 10: Existing payroll fields remain populated correctly", async () => {
    const period = (await pool.query("SELECT * FROM payroll_periods WHERE year=2999 AND month=1 AND notes=$1", [marker])).rows[0];
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toHaveProperty("base_salary");
    expect(rec).toHaveProperty("gross_pay");
    expect(rec).toHaveProperty("payable_days");
    expect(rec).toHaveProperty("present_days");
    expect(rec).toHaveProperty("absent_days");
    expect(rec).toHaveProperty("attendance_deduction");
    expect(rec).toHaveProperty("advance_recovery");
    expect(rec).toHaveProperty("net_pay");
    expect(rec).toHaveProperty("calculation_details");

    const details = typeof rec.calculation_details === "string" ? JSON.parse(rec.calculation_details) : rec.calculation_details;
    expect(details.method).toBe("fixed-30-day-basis");
    expect(details.salary_basis_days).toBe(30);
  });

  it("Test 11: Mid-period salary changes calculate each interval with its correct rate", async () => {
    await pool.query("DELETE FROM payroll_deductions WHERE payroll_record_id IN (SELECT id FROM employee_payroll_records WHERE employee_id=$1)", [testEmpId]);
    await pool.query("DELETE FROM employee_advance_transactions WHERE employee_id=$1", [testEmpId]);
    await pool.query("DELETE FROM employee_payroll_records WHERE employee_id=$1", [testEmpId]);
    await pool.query("DELETE FROM employee_salary_history WHERE employee_id=$1", [testEmpId]);


    await pool.query(
      "INSERT INTO employee_salary_history(employee_id, salary_type, monthly_salary, effective_from, effective_to, active) VALUES($1, 'MONTHLY', 12000, '2999-09-01', '2999-09-15', true)",
      [testEmpId],
    );
    await pool.query(
      "INSERT INTO employee_salary_history(employee_id, salary_type, monthly_salary, effective_from, effective_to, active) VALUES($1, 'MONTHLY', 15000, '2999-09-16', NULL, true)",
      [testEmpId],
    );

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
    for (let i = 1; i <= 30; i++) {
      const dayStr = `2999-09-${String(i).padStart(2, "0")}`;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
        [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
      );
    }

    const period = await createPeriod({ year: 2999, month: 9, notes: marker }, adminId);
    await generate(period.id, adminId);
    const records = await listRecords(period.id);
    const rec = records.find((r) => r.employee_id === testEmpId);

    expect(rec).toBeTruthy();
    // 15 days @ 400 (6000) + 15 days @ 500 (7500) = 13500 gross/net pay
    expect(Number(rec.net_pay)).toBe(13500);
  });
});

