import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { createShift, validateShiftSessions } from "../src/modules/shifts/shifts.service.js";
import { rebuildAttendanceForBiometricDate, listAttendance } from "../src/modules/attendance/attendance.repository.js";
import { attendance as getAttendanceReport } from "../src/modules/reports/reports.service.js";

const pool = getDatabasePool();
const marker = `splitshift-${crypto.randomUUID()}`;
const attendanceDate = "2026-07-25";

function istDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hours, minutes, seconds = 0] = time.split(":").map(Number) as [number, number, number?];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - 330 * 60_000);
}

describe("Split-Shift Support Integration Tests", () => {
  let employeeId: string;
  let biometricId: number;

  beforeAll(async () => {
    biometricId = crypto.randomInt(90_000_000, 99_000_000);
    const empRes = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '2026-01-01')
       RETURNING id`,
      [biometricId, `Emp-${marker}`, `EMP-${biometricId}`]
    );
    employeeId = empRes.rows[0].id;
  });

  afterAll(async () => {
    delete process.env.ATTENDANCE_TEST_NOW;
    if (employeeId) {
      await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = $1", [employeeId]);
      await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = $1", [employeeId]);
      await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [biometricId]);
      await pool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
    }
    await pool.query("DELETE FROM shift_sessions WHERE shift_id IN (SELECT id FROM shifts WHERE name LIKE $1)", [`%${marker}%`]);
    await pool.query("DELETE FROM shifts WHERE name LIKE $1", [`%${marker}%`]);
  });

  it("1. Existing one-session shift still works", async () => {
    const shift = await createShift({
      name: `Single-${marker}`,
      start_time: "09:00",
      end_time: "17:00",
      grace_minutes: 15,
      checkout_after_minutes: 60,
    });

    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '2026-01-01')`,
      [employeeId, shift.id]
    );

    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5)`,
      [
        biometricId,
        istDateTime(attendanceDate, "09:05"),
        `${marker}-1`,
        istDateTime(attendanceDate, "17:00"),
        `${marker}-2`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "20:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(biometricId), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId });
    expect(records.length).toBe(1);
    expect(records[0]?.status).toBe("PRESENT");
    expect(records[0]?.working_minutes).toBe(475);
    expect(records[0]?.session_records?.length).toBe(1);
  });

  it("2. Two-session shift with four punches calculates correctly", async () => {
    const bioId2 = crypto.randomInt(90_000_000, 99_000_000);
    const emp2Res = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '2026-01-01') RETURNING id`,
      [bioId2, `Emp2-${marker}`, `EMP-${bioId2}`]
    );
    const emp2Id = emp2Res.rows[0].id;

    const shift = await createShift({
      name: `Split2-${marker}`,
      sessions: [
        {
          session_number: 1,
          start_time: "07:00",
          end_time: "13:00",
          grace_minutes: 10,
          minimum_work_minutes: 300,
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
          grace_minutes: 10,
          minimum_work_minutes: 200,
          early_exit_tolerance_minutes: 5,
          checkin_before_minutes: 30,
          checkout_after_minutes: 60,
          crosses_midnight: false,
          active: true,
        },
      ],
    });

    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '2026-01-01')`,
      [emp2Id, shift.id]
    );

    // Punches: Session 1 (07:00-13:00) = 360 mins, Session 2 (19:00-23:00) = 240 mins. Total = 600 mins.
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9)`,
      [
        bioId2,
        istDateTime(attendanceDate, "07:00"),
        `${marker}-s1-in`,
        istDateTime(attendanceDate, "13:00"),
        `${marker}-s1-out`,
        istDateTime(attendanceDate, "19:00"),
        `${marker}-s2-in`,
        istDateTime(attendanceDate, "23:00"),
        `${marker}-s2-out`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "23:59").toISOString();
    await rebuildAttendanceForBiometricDate(String(bioId2), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: emp2Id });
    expect(records.length).toBe(1);
    expect(records[0]?.status).toBe("PRESENT");
    expect(records[0]?.working_minutes).toBe(600); // 360 + 240
    expect(records[0]?.session_records?.length).toBe(2);
    expect(records[0]?.session_records?.[0]?.worked_minutes).toBe(360);
    expect(records[0]?.session_records?.[1]?.worked_minutes).toBe(240);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = $1", [emp2Id]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = $1", [emp2Id]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [bioId2]);
    await pool.query("DELETE FROM employees WHERE id = $1", [emp2Id]);
  });

  it("3. Gap between sessions is excluded from working time", async () => {
    const bioId3 = crypto.randomInt(90_000_000, 99_000_000);
    const emp3Res = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '2026-01-01') RETURNING id`,
      [bioId3, `Emp3-${marker}`, `EMP-${bioId3}`]
    );
    const emp3Id = emp3Res.rows[0].id;

    const shift = await createShift({
      name: `Gap-${marker}`,
      sessions: [
        {
          session_number: 1,
          start_time: "08:00",
          end_time: "12:00",
          grace_minutes: 0,
          minimum_work_minutes: 0,
          early_exit_tolerance_minutes: 0,
          checkin_before_minutes: 15,
          checkout_after_minutes: 30,
          crosses_midnight: false,
          active: true,
        },
        {
          session_number: 2,
          start_time: "16:00",
          end_time: "20:00",
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

    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '2026-01-01')`,
      [emp3Id, shift.id]
    );

    // 08:00 to 12:00 = 4 hrs (240m). Gap 12:00 to 16:00 (4 hrs) break. 16:00 to 20:00 = 4 hrs (240m).
    // Total working minutes must be 480, NOT 720!
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9)`,
      [
        bioId3,
        istDateTime(attendanceDate, "08:00"),
        `${marker}-g1-in`,
        istDateTime(attendanceDate, "12:00"),
        `${marker}-g1-out`,
        istDateTime(attendanceDate, "16:00"),
        `${marker}-g2-in`,
        istDateTime(attendanceDate, "20:00"),
        `${marker}-g2-out`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "22:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(bioId3), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: emp3Id });
    expect(records.length).toBe(1);
    expect(records[0]?.working_minutes).toBe(480); // Gap excluded!

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = $1", [emp3Id]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = $1", [emp3Id]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [bioId3]);
    await pool.query("DELETE FROM employees WHERE id = $1", [emp3Id]);
  });

  it("4. Missing Session 1 checkout creates a MISSING_PUNCH status", async () => {
    const bioId4 = crypto.randomInt(90_000_000, 99_000_000);
    const emp4Res = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '2026-01-01') RETURNING id`,
      [bioId4, `Emp4-${marker}`, `EMP-${bioId4}`]
    );
    const emp4Id = emp4Res.rows[0].id;

    const shift = await createShift({
      name: `Miss1-${marker}`,
      sessions: [
        {
          session_number: 1,
          start_time: "08:00",
          end_time: "12:00",
          grace_minutes: 0,
          minimum_work_minutes: 0,
          early_exit_tolerance_minutes: 0,
          checkin_before_minutes: 15,
          checkout_after_minutes: 30,
          crosses_midnight: false,
          active: true,
        },
        {
          session_number: 2,
          start_time: "16:00",
          end_time: "20:00",
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

    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '2026-01-01')`,
      [emp4Id, shift.id]
    );

    // Punch in at 08:00 (Session 1), NO checkout for Session 1.
    // Punches for Session 2: 16:00 and 20:00.
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7)`,
      [
        bioId4,
        istDateTime(attendanceDate, "08:00"),
        `${marker}-m1-in`,
        istDateTime(attendanceDate, "16:00"),
        `${marker}-m2-in`,
        istDateTime(attendanceDate, "20:00"),
        `${marker}-m2-out`,
      ]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "22:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(bioId4), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: emp4Id });
    expect(records.length).toBe(1);
    expect(records[0]?.status).toBe("MISSING_PUNCH");

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = $1", [emp4Id]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = $1", [emp4Id]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [bioId4]);
    await pool.query("DELETE FROM employees WHERE id = $1", [emp4Id]);
  });

  it("15. Future sessions remain NOT_STARTED during the morning", async () => {
    const bioId15 = crypto.randomInt(90_000_000, 99_000_000);
    const emp15Res = await pool.query(
      `INSERT INTO employees (biometric_id, name, employee_code, active, joining_date)
       VALUES ($1, $2, $3, true, '2026-01-01') RETURNING id`,
      [bioId15, `Emp15-${marker}`, `EMP-${bioId15}`]
    );
    const emp15Id = emp15Res.rows[0].id;

    const shift = await createShift({
      name: `Future-${marker}`,
      sessions: [
        {
          session_number: 1,
          start_time: "07:00",
          end_time: "12:00",
          grace_minutes: 10,
          minimum_work_minutes: 0,
          early_exit_tolerance_minutes: 0,
          checkin_before_minutes: 15,
          checkout_after_minutes: 30,
          crosses_midnight: false,
          active: true,
        },
        {
          session_number: 2,
          start_time: "18:00",
          end_time: "22:00",
          grace_minutes: 10,
          minimum_work_minutes: 0,
          early_exit_tolerance_minutes: 0,
          checkin_before_minutes: 15,
          checkout_after_minutes: 30,
          crosses_midnight: false,
          active: true,
        },
      ],
    });

    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, '2026-01-01')`,
      [emp15Id, shift.id]
    );

    // At 10:00 AM, Session 1 is in progress (checked in at 07:00). Session 2 (18:00) has NOT started yet.
    await pool.query(
      `INSERT INTO raw_attendance_punches (biometric_id, punch_time, source_event_key)
       VALUES ($1, $2, $3)`,
      [bioId15, istDateTime(attendanceDate, "07:00"), `${marker}-f1-in`]
    );

    process.env.ATTENDANCE_TEST_NOW = istDateTime(attendanceDate, "10:00").toISOString();
    await rebuildAttendanceForBiometricDate(String(bioId15), attendanceDate);

    const records = await listAttendance({ date: attendanceDate, employeeId: emp15Id });
    expect(records.length).toBe(1);
    expect(records[0]?.session_records?.[1]?.status).toBe("NOT_STARTED");
    expect(records[0]?.session_records?.[1]?.missing_punch).toBe(false);

    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id = $1", [emp15Id]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = $1", [emp15Id]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id = $1", [bioId15]);
    await pool.query("DELETE FROM employees WHERE id = $1", [emp15Id]);
  });

  it("16. Overlapping punch windows validation rejects overlapping session windows", () => {
    expect(() => {
      validateShiftSessions([
        {
          session_number: 1,
          start_time: "08:00",
          end_time: "13:00",
          grace_minutes: 0,
          minimum_work_minutes: 0,
          early_exit_tolerance_minutes: 0,
          checkin_before_minutes: 15,
          checkout_after_minutes: 120, // Window ends at 15:00
          crosses_midnight: false,
          active: true,
        },
        {
          session_number: 2,
          start_time: "14:00", // Window starts at 13:45 -> OVERLAPS!
          end_time: "18:00",
          grace_minutes: 0,
          minimum_work_minutes: 0,
          early_exit_tolerance_minutes: 0,
          checkin_before_minutes: 15,
          checkout_after_minutes: 30,
          crosses_midnight: false,
          active: true,
        },
      ]);
    }).toThrow("Validation: Session 1 and Session 2 punch windows overlap");
  });

  it("11. One employee with multiple sessions appears once in reports", async () => {
    const reportRes = await getAttendanceReport({ date: attendanceDate, employeeId });
    expect(reportRes.items.length).toBe(1);
    expect(reportRes.pagination.total).toBe(1);
  });
});
