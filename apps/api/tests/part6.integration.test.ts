import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDatabasePool } from "../src/infrastructure/database/database.js";
import {
  executeDuplicateCleanup,
  previewDuplicateCleanup,
} from "../src/modules/maintenance/cleanup-duplicate-punches.service.js";

const pool = getDatabasePool();
const marker = `part6-${crypto.randomUUID()}`;
const deviceCode = `${marker}-dev`;
const bioTest = crypto.randomInt(1_000_000, 9_000_000);

describe("Part 6: Safe Exact-Duplicate Cleanup", () => {
  let deviceId = "";
  let canonicalId = "";
  let dupId1 = "";
  let dupId2 = "";
  let diffTimeId = "";
  let diffStateId = "";
  let diffVerifyId = "";

  beforeAll(async () => {
    // 1. Create a test device
    const devRes = await pool.query<{ id: string }>(
      "INSERT INTO devices(device_code, name, model, serial_number, active, status) VALUES ($1, $2, 'MB160', $3, true, 'ONLINE') RETURNING id",
      [deviceCode, `${marker}-device`, `SER-${marker}`],
    );
    deviceId = devRes.rows[0]!.id;

    // 2. Insert Group A: 3 exact duplicate punches (same device, biometric_id, punch_time, punch_state '0', verify_mode '1')
    const p1 = await pool.query<{ id: string }>(
      "INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, punch_state, verify_mode, source_event_key) VALUES ($1, $2, '2024-05-01 10:00:00', '0', '1', $3) RETURNING id",
      [deviceId, bioTest, `${marker}-dupe-1`],
    );
    canonicalId = p1.rows[0]!.id;

    const p2 = await pool.query<{ id: string }>(
      "INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, punch_state, verify_mode, source_event_key) VALUES ($1, $2, '2024-05-01 10:00:00', '0', '1', $3) RETURNING id",
      [deviceId, bioTest, `${marker}-dupe-2`],
    );
    dupId1 = p2.rows[0]!.id;

    const p3 = await pool.query<{ id: string }>(
      "INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, punch_state, verify_mode, source_event_key) VALUES ($1, $2, '2024-05-01 10:00:00', '0', '1', $3) RETURNING id",
      [deviceId, bioTest, `${marker}-dupe-3`],
    );
    dupId2 = p3.rows[0]!.id;

    // 3. Insert Group B: Different timestamp (10:00:05) -> MUST BE PRESERVED
    const pDiffTime = await pool.query<{ id: string }>(
      "INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, punch_state, verify_mode, source_event_key) VALUES ($1, $2, '2024-05-01 10:00:05', '0', '1', $3) RETURNING id",
      [deviceId, bioTest, `${marker}-diff-time`],
    );
    diffTimeId = pDiffTime.rows[0]!.id;

    // 4. Insert Group C: Different punch_state ('1') -> MUST BE PRESERVED
    const pDiffState = await pool.query<{ id: string }>(
      "INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, punch_state, verify_mode, source_event_key) VALUES ($1, $2, '2024-05-01 10:00:00', '1', '1', $3) RETURNING id",
      [deviceId, bioTest, `${marker}-diff-state`],
    );
    diffStateId = pDiffState.rows[0]!.id;

    // 5. Insert Group D: Different verify_mode ('2') -> MUST BE PRESERVED
    const pDiffVerify = await pool.query<{ id: string }>(
      "INSERT INTO raw_attendance_punches(device_id, biometric_id, punch_time, punch_state, verify_mode, source_event_key) VALUES ($1, $2, '2024-05-01 10:00:00', '0', '2', $3) RETURNING id",
      [deviceId, bioTest, `${marker}-diff-verify`],
    );
    diffVerifyId = pDiffVerify.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM raw_attendance_punches WHERE source_event_key LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM devices WHERE id = $1", [deviceId]);
    await pool.query(
      "DO $$ BEGIN IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'maintenance_audit_logs') THEN DELETE FROM maintenance_audit_logs WHERE details->>'device' = '" +
        deviceCode +
        "'; END IF; END $$;",
    );
  });

  it("detects exact duplicate group and counts duplicate rows in preview mode without modifying data", async () => {
    const preview = await previewDuplicateCleanup({ deviceCode });

    expect(preview.device).toBe(deviceCode);
    expect(preview.duplicateGroups).toBe(1);
    expect(preview.totalDuplicateRows).toBe(2); // 3 items in group - 1 canonical = 2 duplicates to remove
    expect(preview.recordsRemoved).toBe(2);
    expect(preview.affectedBiometricIds).toContain(String(bioTest));

    // Verify all 6 punches still exist in DB
    const check = await pool.query("SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE device_id = $1", [deviceId]);
    expect(check.rows[0]!.count).toBe(6);
  });

  it("requires --execute and exact confirmation text REMOVE EXACT DUPLICATES", async () => {
    await expect(executeDuplicateCleanup({ deviceCode, execute: false })).rejects.toThrow(
      "Validation: Re-run with --execute",
    );
    await expect(
      executeDuplicateCleanup({ deviceCode, execute: true, confirmation: "CLEAR DATA" }),
    ).rejects.toThrow('Validation: Execution requires exact confirmation text: "REMOVE EXACT DUPLICATES"');
  });

  it("executes cleanup: preserves canonical record, removes exact duplicates, preserves distinct punches, and writes audit log", async () => {
    const result = await executeDuplicateCleanup({
      deviceCode,
      execute: true,
      confirmation: "REMOVE EXACT DUPLICATES",
    });

    expect(result.success).toBe(true);
    expect(result.duplicateGroupsCount).toBe(1);
    expect(result.deletedDuplicateRows).toBe(2);
    expect(result.preservedCanonicalRecords).toBe(1);
    expect(result.auditLogId).toBeDefined();

    // Canonical record MUST BE PRESERVED
    const canonCheck = await pool.query("SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE id = $1", [canonicalId]);
    expect(canonCheck.rows[0]!.count).toBe(1);

    // Duplicates (dupId1, dupId2) MUST BE REMOVED
    const dupCheck1 = await pool.query("SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE id = $1", [dupId1]);
    expect(dupCheck1.rows[0]!.count).toBe(0);
    const dupCheck2 = await pool.query("SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE id = $1", [dupId2]);
    expect(dupCheck2.rows[0]!.count).toBe(0);

    // Different timestamp record MUST BE PRESERVED
    const diffTimeCheck = await pool.query("SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE id = $1", [diffTimeId]);
    expect(diffTimeCheck.rows[0]!.count).toBe(1);

    // Different state record MUST BE PRESERVED
    const diffStateCheck = await pool.query("SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE id = $1", [diffStateId]);
    expect(diffStateCheck.rows[0]!.count).toBe(1);

    // Different verify mode record MUST BE PRESERVED
    const diffVerifyCheck = await pool.query("SELECT COUNT(*)::int AS count FROM raw_attendance_punches WHERE id = $1", [diffVerifyId]);
    expect(diffVerifyCheck.rows[0]!.count).toBe(1);

    // Audit log entry created
    const auditCheck = await pool.query("SELECT * FROM maintenance_audit_logs WHERE id = $1", [result.auditLogId]);
    expect(auditCheck.rows.length).toBe(1);
    expect(auditCheck.rows[0]!.action).toBe("CLEANUP_DUPLICATE_PUNCHES");
  });
});
