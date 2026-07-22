/* eslint-disable no-undef */
exports.up = (pgm) => pgm.sql(`
  ALTER TABLE daily_attendance_records DROP CONSTRAINT IF EXISTS daily_attendance_records_status_check;
  ALTER TABLE daily_attendance_records ADD CONSTRAINT daily_attendance_records_status_check CHECK (status IN ('PRESENT','LATE','EARLY_EXIT','LATE_AND_EARLY_EXIT','HALF_DAY','ABSENT','MISSING_PUNCH','CURRENTLY_CHECKED_IN','PENDING','CHECK_IN_MISSING','WEEKLY_OFF','HOLIDAY','NO_SHIFT','UNMATCHED'));
`);
exports.down = (pgm) => pgm.sql(`
  UPDATE daily_attendance_records SET status='ABSENT',note='No biometric attendance recorded' WHERE status IN ('PENDING','CHECK_IN_MISSING');
  ALTER TABLE daily_attendance_records DROP CONSTRAINT IF EXISTS daily_attendance_records_status_check;
  ALTER TABLE daily_attendance_records ADD CONSTRAINT daily_attendance_records_status_check CHECK (status IN ('PRESENT','LATE','EARLY_EXIT','LATE_AND_EARLY_EXIT','HALF_DAY','ABSENT','MISSING_PUNCH','CURRENTLY_CHECKED_IN','WEEKLY_OFF','HOLIDAY','NO_SHIFT','UNMATCHED'));
`);
