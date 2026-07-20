/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS daily_attendance_records (
      attendance_key text PRIMARY KEY,
      attendance_date date NOT NULL,
      employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
      biometric_id bigint NOT NULL,
      shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
      punch_in_at timestamptz,
      punch_out_at timestamptz,
      working_minutes integer NOT NULL DEFAULT 0,
      raw_punch_count integer NOT NULL DEFAULT 0,
      status text NOT NULL,
      first_raw_punch_id bigint,
      last_raw_punch_id bigint,
      unmatched_raw_punch_id bigint,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT daily_attendance_records_status_check CHECK (status IN ('PRESENT', 'MISSING_PUNCH', 'UNMATCHED', 'NO_SHIFT')),
      CONSTRAINT daily_attendance_records_non_negative_minutes CHECK (working_minutes >= 0),
      CONSTRAINT daily_attendance_records_non_negative_count CHECK (raw_punch_count >= 0)
    );
  `);

  pgm.sql("CREATE INDEX IF NOT EXISTS daily_attendance_records_date_idx ON daily_attendance_records (attendance_date, status);");
  pgm.sql("CREATE INDEX IF NOT EXISTS daily_attendance_records_employee_date_idx ON daily_attendance_records (employee_id, attendance_date);");
  pgm.sql("CREATE INDEX IF NOT EXISTS daily_attendance_records_shift_date_idx ON daily_attendance_records (shift_id, attendance_date);");
  pgm.sql("CREATE INDEX IF NOT EXISTS daily_attendance_records_biometric_date_idx ON daily_attendance_records (biometric_id, attendance_date);");
  pgm.sql("CREATE TRIGGER daily_attendance_records_updated_at BEFORE UPDATE ON daily_attendance_records FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");
};

exports.down = (pgm) => {
  pgm.sql("DROP TABLE IF EXISTS daily_attendance_records;");
};
