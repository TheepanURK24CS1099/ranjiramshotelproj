import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDatabasePool } from "../src/infrastructure/database/database.js";
import {
  executeCleanup,
  previewCleanup,
  validateOptions,
} from "../src/modules/maintenance/cleanup-historical-punches.service.js";

const pool = getDatabasePool();
const marker = `part5-${crypto.randomUUID()}`;
const deviceCode = `${marker}-dev`;
const bioRegistered = crypto.randomInt(1_000_000, 9_000_000);
const bioUnmatched = crypto.randomInt(1_000_000, 9_000_000);

describe("Part 5: Safe Historical Biometric Cleanup Command", () => {
  let deviceId = "";
  let employeeId = "";
  let shiftId = "";

  beforeAll(async () => {
    // 1. Fetch or create a shift for attendance exceptions
    const shiftRes = await pool.query<{ id: string }>(
      "INSERT INTO shifts(name, start_time, end_time) VALUES ($1, '09:00:00', '18:00:00') RETURNING id",
      [`${marker}-shift`],
    );
    shiftId = shiftRes.rows[0]!.id;

    // 2. Create a test device
    const devRes = await pool.query<{ id: string }>(
      "INSERT INTO devices(device_code, name, model, serial_number, active, status) VALUES ($1, $2, 'MB160', $3, true, 'ONLINE') RETURNING id",
      [deviceCode, `${marker}-device`, `SER-${marker}`],
    );
    deviceId = devRes.rows[0]!.id;

    // 3. Create a registered employee
    const empRes = await pool.query<{ id: string }>(
      "INSERT INTO employees(biometric_id, name, employee_code, active, joining_date) VALUES ($1, $2, $3, true, CURRENT_DATE) RETURNING id",
      [bioRegistered, `${marker}-emp`, `${marker}-code`],
    );
    employeeId = empRes.rows[0]!.id;

    // 4. Insert historical punches & attendance BEFORE cutoff date ('2025-01-01')
    // Registered employee punch (MUST BE PROTECTED)
    await pool.query(
      "INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, source_event_key) VALUES ($1, $2, '2024-12-01 09:00:00', $3)",
      [deviceId, bioRegistered, `${marker}-reg-punch`],
    );
    await pool.query(
      "INSERT INTO daily_attendance_records(attendance_key, attendance_date, employee_id, biometric_id, working_minutes, status) VALUES ($1, '2024-12-01', $2, $3, 480, 'PRESENT')",
      [`${marker}-reg-att`, employeeId, bioRegistered],
    );

    // Unmatched historical punch & records (TO BE CLEANED)
    const unmPunchRes = await pool.query<{ id: number }>(
      "INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, source_event_key) VALUES ($1, $2, '2024-12-01 10:00:00', $3) RETURNING id",
      [deviceId, bioUnmatched, `${marker}-unm-punch`],
    );
    const unmPunchId = unmPunchRes.rows[0]!.id;

    await pool.query(
      "INSERT INTO daily_attendance_records(attendance_key, attendance_date, employee_id, biometric_id, working_minutes, status, unmatched_raw_punch_id) VALUES ($1, '2024-12-01', NULL, $2, 0, 'MISSING_PUNCH', $3)",
      [`${marker}-unm-att`, bioUnmatched, unmPunchId],
    );

    // Exception linked to employee
    await pool.query(
      "INSERT INTO attendance_exceptions(raw_punch_id, attendance_date, employee_id, biometric_id, shift_id, punch_time, exception_type, message) VALUES ($1, '2024-12-01', $2, $3, $4, '2024-12-01 10:00:00', 'OUT_OF_SHIFT', 'test exception')",
      [unmPunchId, employeeId, bioUnmatched, shiftId],
    );

    // Current-day unmatched punch (MUST BE PROTECTED by current-day check)
    await pool.query(
      "INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, source_event_key) VALUES ($1, $2, NOW(), $3)",
      [deviceId, bioUnmatched, `${marker}-today-punch`],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM attendance_exceptions WHERE message = 'test exception'");
    await pool.query("DELETE FROM daily_attendance_records WHERE attendance_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE source_event_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
    await pool.query("DELETE FROM devices WHERE id = $1", [deviceId]);
    await pool.query("DELETE FROM shifts WHERE id = $1", [shiftId]);
    await pool.query(
      "DO $$ BEGIN IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'maintenance_audit_logs') THEN DELETE FROM maintenance_audit_logs WHERE details->>'device' = '" +
        deviceCode +
        "'; END IF; END $$;",
    );
  });

  it("validates cutoff date requirements", () => {
    expect(() => validateOptions({})).toThrow("Validation: --before <YYYY-MM-DD> date is required");
    expect(() => validateOptions({ before: "invalid-date" })).toThrow("Validation: --before must be a valid YYYY-MM-DD date");
    const today = new Date().toISOString().slice(0, 10);
    expect(() => validateOptions({ before: today })).toThrow("Validation: Cutoff date must be strictly before current date");
  });

  it("throws error for unknown device code", async () => {
    await expect(previewCleanup({ before: "2025-01-01", deviceCode: "UNKNOWN_CODE_999" })).rejects.toThrow(
      "Validation: Device code not found",
    );
  });

  it("defaults to preview-only mode without mutating database records", async () => {
    const preview = await previewCleanup({ before: "2025-01-01", deviceCode });

    expect(preview.device).toBe(deviceCode);
    expect(preview.cutoffDate).toBe("2025-01-01");
    expect(preview.rawPunchesAffected).toBeGreaterThanOrEqual(1);
    expect(preview.unmatchedDerivedAttendance).toBeGreaterThanOrEqual(1);
    expect(preview.matchedPunchesProtected).toBeGreaterThanOrEqual(1);
    expect(preview.employeeRecordsProtected).toBeGreaterThanOrEqual(1);

    // Verify database data is still intact
    const punchCheck = await pool.query(
      "SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE source_event_key = $1",
      [`${marker}-unm-punch`],
    );
    expect(punchCheck.rows[0].count).toBe(1);
  });

  it("requires --execute and exact confirmation text to execute", async () => {
    await expect(executeCleanup({ before: "2025-01-01", deviceCode, execute: false })).rejects.toThrow(
      "Validation: Re-run with --execute",
    );
    await expect(
      executeCleanup({ before: "2025-01-01", deviceCode, execute: true, confirmation: "WRONG TEXT" }),
    ).rejects.toThrow('Validation: Execution requires exact confirmation text: "CLEAR HISTORICAL DATA"');
  });

  it("executes cleanup: deletes unmatched data, protects registered employees and current day, and writes audit log", async () => {
    const result = await executeCleanup({
      before: "2025-01-01",
      deviceCode,
      biometricIds: [bioUnmatched],
      execute: true,
      confirmation: "CLEAR HISTORICAL DATA",
    });

    expect(result.success).toBe(true);
    expect(result.deletedRawPunches).toBeGreaterThanOrEqual(1);
    expect(result.deletedAttendanceRecords).toBeGreaterThanOrEqual(1);
    expect(result.auditLogId).toBeDefined();

    // 1. Unmatched historical punch is deleted
    const unmPunchCheck = await pool.query(
      "SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE source_event_key = $1",
      [`${marker}-unm-punch`],
    );
    expect(unmPunchCheck.rows[0].count).toBe(0);

    // 2. Unmatched historical attendance record is deleted
    const unmAttCheck = await pool.query(
      "SELECT COUNT(*)::int AS count FROM daily_attendance_records WHERE attendance_key = $1",
      [`${marker}-unm-att`],
    );
    expect(unmAttCheck.rows[0].count).toBe(0);

    // 3. Registered employee punch IS PROTECTED
    const regPunchCheck = await pool.query(
      "SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE source_event_key = $1",
      [`${marker}-reg-punch`],
    );
    expect(regPunchCheck.rows[0].count).toBe(1);

    // 4. Registered employee attendance record IS PROTECTED
    const regAttCheck = await pool.query(
      "SELECT COUNT(*)::int AS count FROM daily_attendance_records WHERE attendance_key = $1",
      [`${marker}-reg-att`],
    );
    expect(regAttCheck.rows[0].count).toBe(1);

    // 5. Current-day punch IS PROTECTED
    const todayPunchCheck = await pool.query(
      "SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE source_event_key = $1",
      [`${marker}-today-punch`],
    );
    expect(todayPunchCheck.rows[0].count).toBe(1);

    // 6. Audit log entry created
    const auditCheck = await pool.query(
      "SELECT * FROM maintenance_audit_logs WHERE id = $1",
      [result.auditLogId],
    );
    expect(auditCheck.rows.length).toBe(1);
    expect(auditCheck.rows[0].action).toBe("CLEANUP_HISTORICAL_PUNCHES");
  });
});
