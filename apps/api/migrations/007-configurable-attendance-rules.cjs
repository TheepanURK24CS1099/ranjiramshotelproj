/* eslint-disable no-undef */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE shifts
      ADD COLUMN IF NOT EXISTS early_exit_tolerance_minutes integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS checkin_before_minutes integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS checkout_after_minutes integer NOT NULL DEFAULT 360,
      ADD COLUMN IF NOT EXISTS weekly_off_days smallint[] NOT NULL DEFAULT '{}';
    ALTER TABLE shifts ADD CONSTRAINT shifts_early_exit_tolerance_non_negative CHECK (early_exit_tolerance_minutes >= 0);
    ALTER TABLE shifts ADD CONSTRAINT shifts_checkin_before_non_negative CHECK (checkin_before_minutes >= 0);
    ALTER TABLE shifts ADD CONSTRAINT shifts_checkout_after_non_negative CHECK (checkout_after_minutes >= 0);
    ALTER TABLE shifts ADD CONSTRAINT shifts_weekly_off_days_valid CHECK (weekly_off_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);

    CREATE TABLE IF NOT EXISTS holidays (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      holiday_date date NOT NULL,
      name text NOT NULL,
      description text,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS holidays_active_date_unique_idx ON holidays (holiday_date) WHERE active;
    CREATE TRIGGER holidays_updated_at BEFORE UPDATE ON holidays FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();

    ALTER TABLE daily_attendance_records
      ADD COLUMN IF NOT EXISTS late_minutes integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS early_exit_minutes integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS note text,
      ADD COLUMN IF NOT EXISTS holiday_id uuid REFERENCES holidays(id) ON DELETE RESTRICT;
    ALTER TABLE daily_attendance_records DROP CONSTRAINT IF EXISTS daily_attendance_records_status_check;
    ALTER TABLE daily_attendance_records ADD CONSTRAINT daily_attendance_records_status_check CHECK (status IN ('PRESENT','LATE','EARLY_EXIT','LATE_AND_EARLY_EXIT','HALF_DAY','ABSENT','MISSING_PUNCH','WEEKLY_OFF','HOLIDAY','NO_SHIFT','UNMATCHED'));
  `);
};

exports.down = (pgm) => {
  pgm.sql("ALTER TABLE daily_attendance_records DROP CONSTRAINT IF EXISTS daily_attendance_records_status_check;");
  pgm.sql("DROP TABLE IF EXISTS holidays;");
  pgm.sql("ALTER TABLE shifts DROP COLUMN IF EXISTS early_exit_tolerance_minutes, DROP COLUMN IF EXISTS checkin_before_minutes, DROP COLUMN IF EXISTS checkout_after_minutes, DROP COLUMN IF EXISTS weekly_off_days;");
};
