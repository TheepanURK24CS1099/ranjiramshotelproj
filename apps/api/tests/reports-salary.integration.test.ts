import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import * as reports from "../src/modules/reports/reports.service.js";

const pool = getDatabasePool();
const marker = `repsal-${crypto.randomUUID().slice(0, 8)}`;
let testEmpId = "";
const bio = crypto.randomInt(910000000, 999000000);

describe("Attendance Reports Salary Integration (Phase 2A & 2B)", () => {
  beforeAll(async () => {
    // 1. Create employee
    const empRes = await pool.query(
      "INSERT INTO employees(biometric_id, name, joining_date, active) VALUES($1, $2, '2026-01-01', true) RETURNING id",
      [bio, marker],
    );
    testEmpId = empRes.rows[0].id;

    // 2. Insert salary history: ₹12,000/month
    await pool.query(
      `INSERT INTO employee_salary_history(employee_id, salary_type, monthly_salary, effective_from, active)
       VALUES($1, 'MONTHLY', 12000, '2026-01-01', true)`,
      [testEmpId],
    );
  });

  afterAll(async () => {
    if (testEmpId) {
      await pool.query("DELETE FROM employee_advance_transactions WHERE employee_id=$1", [testEmpId]);
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
      await pool.query("DELETE FROM employee_salary_history WHERE employee_id=$1", [testEmpId]);
      await pool.query("DELETE FROM employees WHERE id=$1", [testEmpId]);
    }
  });

  describe("Phase 2A: Attendance Summary Report", () => {
    it("15 present days in Aug 1–15 yields ₹6,000 earned salary", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);

      for (let i = 1; i <= 15; i++) {
        const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
        await pool.query(
          "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
          [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
        );
      }

      const reportData = await reports.attendance({
        fromDate: "2026-08-01",
        toDate: "2026-08-15",
        employeeId: testEmpId,
      });

      const item: any = reportData.items.find((x: any) => x.employee_id === testEmpId);
      expect(item).toBeTruthy();
      expect(item.present_days).toBe(15);
      expect(Number(item.monthly_salary)).toBe(12000);
      expect(Number(item.earned_salary)).toBe(6000);
      expect(Number(item.net_payable)).toBe(6000);
    });

    it("Full August (31 days) with no absence yields ₹12,000 earned salary, NOT ₹12,400", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);

      for (let i = 1; i <= 31; i++) {
        const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
        await pool.query(
          "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
          [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
        );
      }

      const reportData = await reports.attendance({
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
        employeeId: testEmpId,
      });

      const item: any = reportData.items.find((x: any) => x.employee_id === testEmpId);
      expect(item).toBeTruthy();
      expect(item.present_days).toBe(31);
      expect(Number(item.monthly_salary)).toBe(12000);
      expect(Number(item.earned_salary)).toBe(12000);
    });

    it("One absent day in full August yields ₹11,600 earned salary", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);

      for (let i = 1; i <= 30; i++) {
        const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
        await pool.query(
          "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
          [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
        );
      }
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'ABSENT', 0)",
        [`${testEmpId}-2026-08-31`, testEmpId, bio, "2026-08-31"],
      );

      const reportData = await reports.attendance({
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
        employeeId: testEmpId,
      });

      const item: any = reportData.items.find((x: any) => x.employee_id === testEmpId);
      expect(item).toBeTruthy();
      expect(item.present_days).toBe(30);
      expect(item.absent_days).toBe(1);
      expect(Number(item.monthly_salary)).toBe(12000);
      expect(Number(item.earned_salary)).toBe(11600);
    });
  });

  describe("Phase 2B: Individual Employee Attendance Report", () => {
    it("returns salarySummary block for individual employee report (Aug 1-15, 15 present days = ₹6,000)", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);
      await pool.query("DELETE FROM employee_advance_transactions WHERE employee_id=$1", [testEmpId]);

      for (let i = 1; i <= 15; i++) {
        const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
        await pool.query(
          "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
          [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
        );
      }

      // Add ₹500 advance transaction
      const adminRes = await pool.query("SELECT id FROM app_users LIMIT 1");
      const adminId = adminRes.rows[0]?.id;
      if (adminId) {
        await pool.query(
          "INSERT INTO employee_advance_transactions(employee_id, transaction_type, amount, transaction_date, notes, created_by) VALUES($1, 'ADVANCE_GIVEN', 500, '2026-08-01', 'Test advance', $2)",
          [testEmpId, adminId],
        );
      }

      const detail: any = await reports.employeeAttendanceDetail(testEmpId, {
        fromDate: "2026-08-01",
        toDate: "2026-08-15",
      });

      expect(detail).toHaveProperty("employee");
      expect(detail).toHaveProperty("summary");
      expect(detail).toHaveProperty("items");
      expect(detail).toHaveProperty("salarySummary");

      const sal = detail.salarySummary;
      expect(sal.monthlySalary).toBe(12000);
      expect(sal.salaryBasisDays).toBe(30);
      expect(sal.dailySalary).toBe(400);
      expect(sal.presentSalaryDays).toBe(15);
      expect(sal.earnedSalary).toBe(6000);

      if (adminId) {
        expect(sal.advance).toBe(500);
        expect(sal.netPayable).toBe(5500); // 6000 - 500 = 5500
      }
    });

    it("full August (31 days, 31 present) yields earnedSalary ₹12,000, NOT ₹12,400 in individual report", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);

      for (let i = 1; i <= 31; i++) {
        const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
        await pool.query(
          "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
          [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
        );
      }

      const detail: any = await reports.employeeAttendanceDetail(testEmpId, {
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
      });

      const sal = detail.salarySummary;
      expect(sal.isFullMonth).toBe(true);
      expect(sal.monthlySalary).toBe(12000);
      expect(sal.earnedSalary).toBe(12000);
    });

    it("full August with 1 absent day yields earnedSalary ₹11,600 in individual report", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);

      for (let i = 1; i <= 30; i++) {
        const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
        await pool.query(
          "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'PRESENT', 480)",
          [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
        );
      }
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'ABSENT', 0)",
        [`${testEmpId}-2026-08-31`, testEmpId, bio, "2026-08-31"],
      );

      const detail: any = await reports.employeeAttendanceDetail(testEmpId, {
        fromDate: "2026-08-01",
        toDate: "2026-08-31",
      });

      const sal = detail.salarySummary;
      expect(sal.earnedSalary).toBe(11600);
      expect(sal.absenceDeduction).toBe(400);
    });

    it("Late and early-exit days count as full salary days in individual report", async () => {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [testEmpId]);

      for (let i = 1; i <= 5; i++) {
        const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
        await pool.query(
          "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'LATE', 450)",
          [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
        );
      }
      for (let i = 6; i <= 10; i++) {
        const dayStr = `2026-08-${String(i).padStart(2, "0")}`;
        await pool.query(
          "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, $4, 'EARLY_EXIT', 430)",
          [`${testEmpId}-${dayStr}`, testEmpId, bio, dayStr],
        );
      }

      const detail: any = await reports.employeeAttendanceDetail(testEmpId, {
        fromDate: "2026-08-01",
        toDate: "2026-08-10",
      });

      const sal = detail.salarySummary;
      expect(sal.presentSalaryDays).toBe(10);
      expect(sal.earnedSalary).toBe(4000); // 10 * 400 = 4000
    });

    it("Preserves existing individual attendance fields (employee, summary, items)", async () => {
      const detail: any = await reports.employeeAttendanceDetail(testEmpId, {
        fromDate: "2026-08-01",
        toDate: "2026-08-10",
      });

      expect(detail.employee).toHaveProperty("id");
      expect(detail.employee).toHaveProperty("name");
      expect(detail.summary).toHaveProperty("totalWorkingDays");
      expect(detail.summary).toHaveProperty("presentDays");
      expect(Array.isArray(detail.items)).toBe(true);
    });
  });

  describe("Phase 2C: Main Attendance Page Integration", () => {
    it("returns salary metrics on getAttendance records for attendance date", async () => {
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, '2026-08-15', 'PRESENT', 480) ON CONFLICT (attendance_key) DO NOTHING",
        [`${testEmpId}-2026-08-15`, testEmpId, bio],
      );
      const { getAttendance } = await import("../src/modules/attendance/attendance.service.js");
      const records: any[] = await getAttendance({ date: "2026-08-15", employeeId: testEmpId });
      const rec = records.find((r) => r.employee_id === testEmpId);
      expect(rec).toBeTruthy();
      expect(rec).toHaveProperty("monthly_salary");
      expect(rec).toHaveProperty("earned_salary");
      expect(rec).toHaveProperty("advance_balance");
      expect(rec).toHaveProperty("net_payable");
      expect(Number(rec.monthly_salary)).toBe(12000);
    });


    it("handles employees without salary records safely", async () => {
      const { getAttendance } = await import("../src/modules/attendance/attendance.service.js");
      const noSalBio = crypto.randomInt(810000000, 899000000);
      const noSalEmp = await pool.query(
        "INSERT INTO employees(biometric_id, name, joining_date, active) VALUES($1, 'No Sal', '2026-01-01', true) RETURNING id",
        [noSalBio],
      );
      const noSalId = noSalEmp.rows[0].id;
      await pool.query(
        "INSERT INTO daily_attendance_records(attendance_key, employee_id, biometric_id, attendance_date, status, working_minutes) VALUES($1, $2, $3, '2026-08-15', 'PRESENT', 480)",
        [`${noSalId}-2026-08-15`, noSalId, noSalBio],
      );

      const records: any[] = await getAttendance({ date: "2026-08-15", employeeId: noSalId });
      const rec = records.find((r) => r.employee_id === noSalId);
      expect(rec).toBeTruthy();
      expect(Number(rec.monthly_salary)).toBe(0);
      expect(Number(rec.earned_salary)).toBe(0);
      expect(Number(rec.advance_balance)).toBe(0);
      expect(Number(rec.net_payable)).toBe(0);

      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [noSalId]);
      await pool.query("DELETE FROM employees WHERE id=$1", [noSalId]);
    });
  });
});

