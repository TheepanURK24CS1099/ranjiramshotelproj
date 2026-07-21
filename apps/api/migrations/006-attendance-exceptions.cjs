/* eslint-disable no-undef */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS attendance_exceptions (
      raw_punch_id bigint PRIMARY KEY REFERENCES raw_attendance_punches(id) ON DELETE CASCADE,
      attendance_date date NOT NULL,
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      biometric_id bigint NOT NULL,
      shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      punch_time timestamptz NOT NULL,
      exception_type text NOT NULL CHECK (exception_type = 'OUT_OF_SHIFT'),
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql("CREATE INDEX IF NOT EXISTS attendance_exceptions_date_idx ON attendance_exceptions (attendance_date, punch_time);");
  pgm.sql("CREATE INDEX IF NOT EXISTS attendance_exceptions_employee_date_idx ON attendance_exceptions (employee_id, attendance_date);");
  pgm.sql("CREATE TRIGGER attendance_exceptions_updated_at BEFORE UPDATE ON attendance_exceptions FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");
};

exports.down = (pgm) => {
  pgm.sql("DROP TABLE IF EXISTS attendance_exceptions;");
};
