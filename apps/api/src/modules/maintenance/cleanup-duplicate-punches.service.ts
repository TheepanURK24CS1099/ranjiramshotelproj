import { getDatabasePool } from "../../infrastructure/database/database.js";

const pool = getDatabasePool();

export interface DuplicateCleanupOptions {
  deviceCode?: string | undefined;
  before?: string | undefined;
  execute?: boolean | undefined;
  confirmation?: string | undefined;
  preview?: boolean | undefined;
}

export interface DuplicatePreviewResult {
  device: string;
  cutoffDate: string | null;
  duplicateGroups: number;
  totalDuplicateRows: number;
  recordsPreserved: number;
  recordsRemoved: number;
  affectedBiometricIds: string[];
  earliestTimestamp: string | null;
  latestTimestamp: string | null;
  matchedAttendanceProtected: number;
}

export interface DuplicateExecutionResult {
  success: boolean;
  duplicateGroupsCount: number;
  deletedDuplicateRows: number;
  preservedCanonicalRecords: number;
  auditLogId: string;
}

export function validateDuplicateOptions(options: DuplicateCleanupOptions): void {
  if (options.before) {
    if (typeof options.before !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(options.before)) {
      throw new Error("Validation: --before must be a valid YYYY-MM-DD date");
    }
    const cutoffParsed = Date.parse(`${options.before}T00:00:00Z`);
    if (Number.isNaN(cutoffParsed)) {
      throw new Error("Validation: --before must be a valid YYYY-MM-DD date");
    }
  }
}

interface GroupRow {
  device_id: string;
  biometric_id: string;
  punch_time: string;
  punch_state: string | null;
  verify_mode: string | null;
  total_count: number;
  canonical_id: string;
  all_ids: string[];
}

export async function previewDuplicateCleanup(
  options: DuplicateCleanupOptions,
): Promise<DuplicatePreviewResult> {
  validateDuplicateOptions(options);

  let deviceId: string | null = null;
  if (options.deviceCode) {
    const devRes = await pool.query<{ id: string }>(
      "SELECT id FROM devices WHERE LOWER(device_code) = LOWER($1)",
      [options.deviceCode],
    );
    if (!devRes.rows[0]) {
      throw new Error(`Validation: Device code not found: ${options.deviceCode}`);
    }
    deviceId = devRes.rows[0].id;
  }

  const clauses: string[] = [];
  const values: unknown[] = [];

  if (deviceId) {
    values.push(deviceId);
    clauses.push(`p.device_id = $${values.length}`);
  }

  if (options.before) {
    values.push(options.before);
    clauses.push(`((p.punch_time AT TIME ZONE 'Asia/Kolkata')::date) < $${values.length}::date`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const sql = `
    SELECT
      p.device_id,
      p.biometric_id::text AS biometric_id,
      to_char(p.punch_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') AS punch_time,
      p.punch_state,
      p.verify_mode,
      COUNT(*)::int AS total_count,
      MIN(p.id)::text AS canonical_id,
      ARRAY_AGG(p.id ORDER BY p.id)::text[] AS all_ids
    FROM raw_attendance_punches p
    ${where}
    GROUP BY p.device_id, p.biometric_id, p.punch_time, p.punch_state, p.verify_mode
    HAVING COUNT(*) > 1
    ORDER BY MIN(p.punch_time) ASC
  `;

  const groupsRes = await pool.query<GroupRow>(sql, values);
  const groups = groupsRes.rows;

  const totalDuplicateRows = groups.reduce((acc, g) => acc + (g.total_count - 1), 0);
  const affectedBioSet = new Set<string>();
  let earliestTimestamp: string | null = null;
  let latestTimestamp: string | null = null;

  for (const g of groups) {
    affectedBioSet.add(g.biometric_id);
    if (!earliestTimestamp || g.punch_time < earliestTimestamp) {
      earliestTimestamp = g.punch_time;
    }
    if (!latestTimestamp || g.punch_time > latestTimestamp) {
      latestTimestamp = g.punch_time;
    }
  }

  const totalPunchesRes = await pool.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM raw_attendance_punches",
  );
  const totalPunches = Number(totalPunchesRes.rows[0]?.count ?? 0);

  const matchedAttRes = await pool.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM daily_attendance_records WHERE employee_id IS NOT NULL",
  );

  return {
    device: options.deviceCode ?? "ALL DEVICES",
    cutoffDate: options.before ?? null,
    duplicateGroups: groups.length,
    totalDuplicateRows,
    recordsPreserved: totalPunches - totalDuplicateRows,
    recordsRemoved: totalDuplicateRows,
    affectedBiometricIds: Array.from(affectedBioSet).sort(),
    earliestTimestamp,
    latestTimestamp,
    matchedAttendanceProtected: Number(matchedAttRes.rows[0]?.count ?? 0),
  };
}

export async function executeDuplicateCleanup(
  options: DuplicateCleanupOptions,
): Promise<DuplicateExecutionResult> {
  validateDuplicateOptions(options);

  if (!options.execute) {
    throw new Error("Validation: Re-run with --execute to remove exact duplicates");
  }

  if (options.confirmation !== "REMOVE EXACT DUPLICATES") {
    throw new Error('Validation: Execution requires exact confirmation text: "REMOVE EXACT DUPLICATES"');
  }

  let deviceId: string | null = null;
  if (options.deviceCode) {
    const devRes = await pool.query<{ id: string }>(
      "SELECT id FROM devices WHERE LOWER(device_code) = LOWER($1)",
      [options.deviceCode],
    );
    if (!devRes.rows[0]) {
      throw new Error(`Validation: Device code not found: ${options.deviceCode}`);
    }
    deviceId = devRes.rows[0].id;
  }

  const clauses: string[] = [];
  const values: unknown[] = [];

  if (deviceId) {
    values.push(deviceId);
    clauses.push(`p.device_id = $${values.length}`);
  }

  if (options.before) {
    values.push(options.before);
    clauses.push(`((p.punch_time AT TIME ZONE 'Asia/Kolkata')::date) < $${values.length}::date`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const sql = `
    SELECT
      p.device_id,
      p.biometric_id::text AS biometric_id,
      p.punch_time::text AS punch_time,
      p.punch_state,
      p.verify_mode,
      COUNT(*)::int AS total_count,
      MIN(p.id)::text AS canonical_id,
      ARRAY_AGG(p.id ORDER BY p.id)::text[] AS all_ids
    FROM raw_attendance_punches p
    ${where}
    GROUP BY p.device_id, p.biometric_id, p.punch_time, p.punch_state, p.verify_mode
    HAVING COUNT(*) > 1
  `;

  const groupsRes = await pool.query<GroupRow>(sql, values);
  const groups = groupsRes.rows;

  const duplicateIdMap = new Map<number, number>(); // duplicate_id -> canonical_id
  const allDuplicateIds: number[] = [];

  for (const g of groups) {
    const canonicalId = Number(g.canonical_id);
    for (const idStr of g.all_ids) {
      const idNum = Number(idStr);
      if (idNum !== canonicalId) {
        duplicateIdMap.set(idNum, canonicalId);
        allDuplicateIds.push(idNum);
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure audit log table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        action text NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    if (allDuplicateIds.length > 0) {
      // Step 1: Update daily_attendance_records referencing duplicate IDs to point to canonical IDs
      for (const [dupId, canonId] of duplicateIdMap.entries()) {
        await client.query(
          `UPDATE daily_attendance_records
           SET first_raw_punch_id = CASE WHEN first_raw_punch_id = $1 THEN $2 ELSE first_raw_punch_id END,
               last_raw_punch_id = CASE WHEN last_raw_punch_id = $1 THEN $2 ELSE last_raw_punch_id END,
               unmatched_raw_punch_id = CASE WHEN unmatched_raw_punch_id = $1 THEN $2 ELSE unmatched_raw_punch_id END
           WHERE first_raw_punch_id = $1 OR last_raw_punch_id = $1 OR unmatched_raw_punch_id = $1`,
          [dupId, canonId],
        );

        await client.query(
          `UPDATE attendance_exceptions
           SET raw_punch_id = $2
           WHERE raw_punch_id = $1`,
          [dupId, canonId],
        );
      }

      // Step 2: Delete exact duplicate raw punches
      await client.query(
        "DELETE FROM raw_attendance_punches WHERE id = ANY($1::bigint[])",
        [allDuplicateIds],
      );
    }

    // Step 3: Write audit log entry
    const auditRes = await client.query<{ id: string }>(
      `INSERT INTO maintenance_audit_logs (action, details)
       VALUES ('CLEANUP_DUPLICATE_PUNCHES', $1::jsonb)
       RETURNING id`,
      [
        JSON.stringify({
          device: options.deviceCode ?? "ALL DEVICES",
          cutoffDate: options.before ?? "NONE",
          duplicateGroupsCount: groups.length,
          deletedDuplicateRows: allDuplicateIds.length,
          preservedCanonicalRecords: groups.length,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      success: true,
      duplicateGroupsCount: groups.length,
      deletedDuplicateRows: allDuplicateIds.length,
      preservedCanonicalRecords: groups.length,
      auditLogId: auditRes.rows[0]?.id ?? "",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
