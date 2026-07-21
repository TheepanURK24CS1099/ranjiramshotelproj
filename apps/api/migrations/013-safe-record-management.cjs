/* eslint-disable no-undef */
exports.up = (pgm) => pgm.sql(`
  ALTER TABLE raw_attendance_punches ADD COLUMN IF NOT EXISTS ignored boolean NOT NULL DEFAULT false;
  ALTER TABLE raw_attendance_punches ADD COLUMN IF NOT EXISTS ignored_at timestamptz;
  ALTER TABLE attendance_exceptions ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES app_users(id) ON DELETE RESTRICT;
  ALTER TABLE attendance_exceptions ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
  ALTER TABLE attendance_exceptions ADD COLUMN IF NOT EXISTS resolution_notes text;
  ALTER TABLE attendance_exceptions ADD COLUMN IF NOT EXISTS safe_to_delete boolean NOT NULL DEFAULT false;
  CREATE INDEX IF NOT EXISTS raw_attendance_punches_ignored_idx ON raw_attendance_punches(ignored, punch_time);
`);
exports.down = (pgm) => pgm.sql(`
  DROP INDEX IF EXISTS raw_attendance_punches_ignored_idx;
  ALTER TABLE attendance_exceptions DROP COLUMN IF EXISTS safe_to_delete, DROP COLUMN IF EXISTS resolution_notes, DROP COLUMN IF EXISTS resolved_at, DROP COLUMN IF EXISTS resolved_by;
  ALTER TABLE raw_attendance_punches DROP COLUMN IF EXISTS ignored_at, DROP COLUMN IF EXISTS ignored;
`);
