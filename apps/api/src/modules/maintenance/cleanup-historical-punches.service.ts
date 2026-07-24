import { getDatabasePool } from "../../infrastructure/database/database.js";

const pool = getDatabasePool();

export interface CleanupOptions {
  deviceCode?: string | undefined;
  before?: string | undefined;
  biometricIds?: number[] | undefined;
  execute?: boolean | undefined;
  confirmation?: string | undefined;
  preview?: boolean | undefined;
}

export interface PreviewResult {
  device: string;
  cutoffDate: string;
  biometricIdsAffected: string[];
  rawPunchesAffected: number;
  exactDuplicates: number;
  firstPunchDate: string | null;
  lastPunchDate: string | null;
  unmatchedDerivedAttendance: number;
  unmatchedExceptions: number;
  matchedPunchesProtected: number;
  currentDayRecordsProtected: number;
  payrollRecordsProtected: number;
  employeeRecordsProtected: number;
}

export interface ExecutionResult {
  success: boolean;
  deletedRawPunches: number;
  deletedAttendanceRecords: number;
  deletedExceptions: number;
  auditLogId: string;
}

export function validateOptions(options: CleanupOptions): void {
  if (!options.before || typeof options.before !== "string") {
    throw new Error("Validation: --before <YYYY-MM-DD> date is required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(options.before)) {
    throw new Error("Validation: --before must be a valid YYYY-MM-DD date");
  }
  const cutoffParsed = Date.parse(`${options.before}T00:00:00Z`);
  if (Number.isNaN(cutoffParsed)) {
    throw new Error("Validation: --before must be a valid YYYY-MM-DD date");
  }
  const todayIST = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  if (options.before >= todayIST) {
    throw new Error("Validation: Cutoff date must be strictly before current date");
  }
}

export async function previewCleanup(options: CleanupOptions): Promise<PreviewResult> {
  validateOptions(options);

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

  const before = options.before!;
  const bioFilter = options.biometricIds && options.biometricIds.length > 0;

  // 1. Raw punches query
  const pClauses: string[] = [
    "p.biometric_id NOT IN (SELECT biometric_id FROM employees WHERE biometric_id IS NOT NULL)",
    "((p.punch_time AT TIME ZONE 'Asia/Kolkata')::date) < $1::date",
    "((p.punch_time AT TIME ZONE 'Asia/Kolkata')::date) < CURRENT_DATE",
  ];
  const pValues: unknown[] = [before];
  if (deviceId) {
    pValues.push(deviceId);
    pClauses.push(`p.device_id = $${pValues.length}`);
  }
  if (bioFilter) {
    pValues.push(options.biometricIds);
    pClauses.push(`p.biometric_id = ANY($${pValues.length}::bigint[])`);
  }
  const pWhere = `WHERE ${pClauses.join(" AND ")}`;

  const punchesRes = await pool.query<{ count: number; first_date: string | null; last_date: string | null }>(
    `SELECT
       COUNT(*)::int AS count,
       MIN(((punch_time AT TIME ZONE 'Asia/Kolkata')::date))::text AS first_date,
       MAX(((punch_time AT TIME ZONE 'Asia/Kolkata')::date))::text AS last_date
     FROM raw_attendance_punches p ${pWhere}`,
    pValues,
  );

  const bioIdsRes = await pool.query<{ biometric_id: string }>(
    `SELECT DISTINCT p.biometric_id::text FROM raw_attendance_punches p ${pWhere} ORDER BY p.biometric_id::text`,
    pValues,
  );

  const dupesRes = await pool.query<{ dupes: number }>(
    `SELECT COALESCE(SUM(c - 1), 0)::int AS dupes FROM (
       SELECT p.device_id, p.biometric_id, p.punch_time, COUNT(*)::int AS c
       FROM raw_attendance_punches p ${pWhere}
       GROUP BY p.device_id, p.biometric_id, p.punch_time
       HAVING COUNT(*) > 1
     ) d`,
    pValues,
  );

  // 2. Unmatched attendance records
  const aClauses: string[] = [
    "a.employee_id IS NULL",
    "a.biometric_id NOT IN (SELECT biometric_id FROM employees WHERE biometric_id IS NOT NULL)",
    "a.attendance_date < $1::date",
    "a.attendance_date < CURRENT_DATE",
  ];
  const aValues: unknown[] = [before];
  if (bioFilter) {
    aValues.push(options.biometricIds);
    aClauses.push(`a.biometric_id = ANY($${aValues.length}::bigint[])`);
  }
  if (deviceId) {
    aValues.push(deviceId);
    aClauses.push(
      `(a.first_raw_punch_id IN (SELECT id FROM raw_attendance_punches WHERE device_id = $${aValues.length}) OR a.last_raw_punch_id IN (SELECT id FROM raw_attendance_punches WHERE device_id = $${aValues.length}) OR a.unmatched_raw_punch_id IN (SELECT id FROM raw_attendance_punches WHERE device_id = $${aValues.length}))`,
    );
  }
  const aWhere = `WHERE ${aClauses.join(" AND ")}`;
  const attRes = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM daily_attendance_records a ${aWhere}`,
    aValues,
  );

  // 3. Unmatched exceptions
  const eClauses: string[] = [
    "x.raw_punch_id IN (SELECT p.id FROM raw_attendance_punches p WHERE p.biometric_id NOT IN (SELECT biometric_id FROM employees WHERE biometric_id IS NOT NULL))",
    "x.attendance_date < $1::date",
    "x.attendance_date < CURRENT_DATE",
  ];
  const eValues: unknown[] = [before];
  if (bioFilter) {
    eValues.push(options.biometricIds);
    eClauses.push(`x.biometric_id = ANY($${eValues.length}::bigint[])`);
  }
  if (deviceId) {
    eValues.push(deviceId);
    eClauses.push(`x.raw_punch_id IN (SELECT id FROM raw_attendance_punches WHERE device_id = $${eValues.length})`);
  }
  const eWhere = `WHERE ${eClauses.join(" AND ")}`;
  const excRes = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM attendance_exceptions x ${eWhere}`,
    eValues,
  );

  // 4. Protected counts
  const matchedPunchesRes = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM raw_attendance_punches p
     WHERE p.biometric_id IN (SELECT biometric_id FROM employees WHERE biometric_id IS NOT NULL)
       AND ((p.punch_time AT TIME ZONE 'Asia/Kolkata')::date) < $1::date`,
    [before],
  );

  const currentDayRes = await pool.query<{ count: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM raw_attendance_punches WHERE ((punch_time AT TIME ZONE 'Asia/Kolkata')::date) >= CURRENT_DATE) +
       (SELECT COUNT(*) FROM daily_attendance_records WHERE attendance_date >= CURRENT_DATE)
     )::int AS count`,
  );

  const payrollRes = await pool.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM employee_payroll_records",
  );

  const employeeRes = await pool.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM employees",
  );

  return {
    device: options.deviceCode ?? "ALL DEVICES",
    cutoffDate: before,
    biometricIdsAffected: bioIdsRes.rows.map((r) => r.biometric_id),
    rawPunchesAffected: Number(punchesRes.rows[0]?.count ?? 0),
    exactDuplicates: Number(dupesRes.rows[0]?.dupes ?? 0),
    firstPunchDate: punchesRes.rows[0]?.first_date ?? null,
    lastPunchDate: punchesRes.rows[0]?.last_date ?? null,
    unmatchedDerivedAttendance: Number(attRes.rows[0]?.count ?? 0),
    unmatchedExceptions: Number(excRes.rows[0]?.count ?? 0),
    matchedPunchesProtected: Number(matchedPunchesRes.rows[0]?.count ?? 0),
    currentDayRecordsProtected: Number(currentDayRes.rows[0]?.count ?? 0),
    payrollRecordsProtected: Number(payrollRes.rows[0]?.count ?? 0),
    employeeRecordsProtected: Number(employeeRes.rows[0]?.count ?? 0),
  };
}

export async function executeCleanup(options: CleanupOptions): Promise<ExecutionResult> {
  validateOptions(options);

  if (!options.execute) {
    throw new Error("Validation: Re-run with --execute to perform historical cleanup");
  }

  if (options.confirmation !== "CLEAR HISTORICAL DATA") {
    throw new Error('Validation: Execution requires exact confirmation text: "CLEAR HISTORICAL DATA"');
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

  const preview = await previewCleanup(options);
  const before = options.before!;
  const bioFilter = options.biometricIds && options.biometricIds.length > 0;

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

    // Step 1: Delete matching attendance_exceptions
    const eClauses: string[] = [
      "x.raw_punch_id IN (SELECT p.id FROM raw_attendance_punches p WHERE p.biometric_id NOT IN (SELECT biometric_id FROM employees WHERE biometric_id IS NOT NULL))",
      "x.attendance_date < $1::date",
      "x.attendance_date < CURRENT_DATE",
    ];
    const eValues: unknown[] = [before];
    if (bioFilter) {
      eValues.push(options.biometricIds);
      eClauses.push(`x.biometric_id = ANY($${eValues.length}::bigint[])`);
    }
    if (deviceId) {
      eValues.push(deviceId);
      eClauses.push(`x.raw_punch_id IN (SELECT id FROM raw_attendance_punches WHERE device_id = $${eValues.length})`);
    }
    const eRes = await client.query(
      `DELETE FROM attendance_exceptions x WHERE ${eClauses.join(" AND ")}`,
      eValues,
    );

    // Step 2: Delete matching daily_attendance_records
    const aClauses: string[] = [
      "a.employee_id IS NULL",
      "a.biometric_id NOT IN (SELECT biometric_id FROM employees WHERE biometric_id IS NOT NULL)",
      "a.attendance_date < $1::date",
      "a.attendance_date < CURRENT_DATE",
    ];
    const aValues: unknown[] = [before];
    if (bioFilter) {
      aValues.push(options.biometricIds);
      aClauses.push(`a.biometric_id = ANY($${aValues.length}::bigint[])`);
    }
    if (deviceId) {
      aValues.push(deviceId);
      aClauses.push(
        `(a.first_raw_punch_id IN (SELECT id FROM raw_attendance_punches WHERE device_id = $${aValues.length}) OR a.last_raw_punch_id IN (SELECT id FROM raw_attendance_punches WHERE device_id = $${aValues.length}) OR a.unmatched_raw_punch_id IN (SELECT id FROM raw_attendance_punches WHERE device_id = $${aValues.length}))`,
      );
    }
    const aRes = await client.query(
      `DELETE FROM daily_attendance_records a WHERE ${aClauses.join(" AND ")}`,
      aValues,
    );

    // Step 3: Delete matching raw_attendance_punches
    const pClauses: string[] = [
      "p.biometric_id NOT IN (SELECT biometric_id FROM employees WHERE biometric_id IS NOT NULL)",
      "((p.punch_time AT TIME ZONE 'Asia/Kolkata')::date) < $1::date",
      "((p.punch_time AT TIME ZONE 'Asia/Kolkata')::date) < CURRENT_DATE",
    ];
    const pValues: unknown[] = [before];
    if (deviceId) {
      pValues.push(deviceId);
      pClauses.push(`p.device_id = $${pValues.length}`);
    }
    if (bioFilter) {
      pValues.push(options.biometricIds);
      pClauses.push(`p.biometric_id = ANY($${pValues.length}::bigint[])`);
    }
    const pRes = await client.query(
      `DELETE FROM raw_attendance_punches p WHERE ${pClauses.join(" AND ")}`,
      pValues,
    );

    // Step 4: Write audit log entry
    const auditRes = await client.query<{ id: string }>(
      `INSERT INTO maintenance_audit_logs (action, details)
       VALUES ('CLEANUP_HISTORICAL_PUNCHES', $1::jsonb)
       RETURNING id`,
      [
        JSON.stringify({
          device: preview.device,
          cutoffDate: before,
          deletedRawPunches: pRes.rowCount ?? 0,
          deletedAttendanceRecords: aRes.rowCount ?? 0,
          deletedExceptions: eRes.rowCount ?? 0,
          biometricIdsAffected: preview.biometricIdsAffected,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      success: true,
      deletedRawPunches: pRes.rowCount ?? 0,
      deletedAttendanceRecords: aRes.rowCount ?? 0,
      deletedExceptions: eRes.rowCount ?? 0,
      auditLogId: auditRes.rows[0]?.id ?? "",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
