import { getDatabasePool } from "../../infrastructure/database/database.js";
import type { ParsedPunch } from "./adms.parser.js";

const pool = getDatabasePool();

export interface StoredPunch {
  biometric_id: string;
  punch_time: Date;
  inserted: boolean;
}

export async function insertPunch(deviceId: string, deviceCode: string, punch: ParsedPunch, key: string): Promise<StoredPunch> {
  const inserted = await pool.query<Omit<StoredPunch, "inserted">>(
    `INSERT INTO raw_attendance_punches (
      device_id,
      biometric_id,
      punch_time,
      punch_state,
      verify_mode,
      work_code,
      device_code,
      source,
      device_timestamp,
      raw_payload,
      source_event_key
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ADMS', $8, $9::jsonb, $10)
    ON CONFLICT (source_event_key) DO NOTHING
    RETURNING biometric_id, punch_time`,
    [
      deviceId,
      punch.biometricId,
      punch.punchTime,
      punch.punchState,
      punch.verifyMode,
      punch.workCode,
      deviceCode,
      punch.deviceTimestamp,
      JSON.stringify({ payload: punch.rawPayload, record: punch.rawRecord }),
      key,
    ],
  );

  const stored = inserted.rows[0];
  if (stored) {
    return { ...stored, inserted: true };
  }

  const existing = await pool.query<Omit<StoredPunch, "inserted">>(
    `SELECT biometric_id, punch_time
     FROM raw_attendance_punches
     WHERE source_event_key = $1`,
    [key],
  );
  const duplicate = existing.rows[0];
  if (!duplicate) {
    throw new Error("Stored ADMS punch could not be found after source event conflict");
  }

  return { ...duplicate, inserted: false };
}
