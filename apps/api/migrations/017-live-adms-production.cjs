/* eslint-disable no-undef */

// Follow-up only: Parts 1–18 migrations remain immutable.
exports.up = (pgm) => pgm.sql(`
  ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_sync timestamptz;
  ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_raw_punch_time timestamptz;

  ALTER TABLE raw_attendance_punches ADD COLUMN IF NOT EXISTS device_code text;
  ALTER TABLE raw_attendance_punches ADD COLUMN IF NOT EXISTS work_code text;
  ALTER TABLE raw_attendance_punches ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ADMS';
  ALTER TABLE raw_attendance_punches ADD COLUMN IF NOT EXISTS device_timestamp text;
  ALTER TABLE raw_attendance_punches ADD COLUMN IF NOT EXISTS processed boolean NOT NULL DEFAULT false;
  ALTER TABLE raw_attendance_punches ADD COLUMN IF NOT EXISTS processed_at timestamptz;
  ALTER TABLE raw_attendance_punches ADD COLUMN IF NOT EXISTS failure_reason text;

  CREATE INDEX IF NOT EXISTS raw_attendance_punches_device_received_idx
    ON raw_attendance_punches (device_id, received_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS raw_attendance_punches_unprocessed_idx
    ON raw_attendance_punches (processed, ignored, punch_time);
`);

exports.down = (pgm) => pgm.sql(`
  DROP INDEX IF EXISTS raw_attendance_punches_unprocessed_idx;
  DROP INDEX IF EXISTS raw_attendance_punches_device_received_idx;
  ALTER TABLE raw_attendance_punches
    DROP COLUMN IF EXISTS failure_reason,
    DROP COLUMN IF EXISTS processed_at,
    DROP COLUMN IF EXISTS processed,
    DROP COLUMN IF EXISTS device_timestamp,
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS work_code,
    DROP COLUMN IF EXISTS device_code;
  ALTER TABLE devices DROP COLUMN IF EXISTS last_raw_punch_time, DROP COLUMN IF EXISTS last_sync;
`);
