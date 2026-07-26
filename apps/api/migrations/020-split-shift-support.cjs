/* global exports */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS shift_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      session_number integer NOT NULL,
      start_time time NOT NULL,
      end_time time NOT NULL,
      grace_minutes integer NOT NULL DEFAULT 0,
      minimum_work_minutes integer NOT NULL DEFAULT 0,
      early_exit_tolerance_minutes integer NOT NULL DEFAULT 0,
      checkin_before_minutes integer NOT NULL DEFAULT 0,
      checkout_after_minutes integer NOT NULL DEFAULT 60,
      crosses_midnight boolean NOT NULL DEFAULT false,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT shift_sessions_session_number_check CHECK (session_number >= 1 AND session_number <= 3),
      CONSTRAINT shift_sessions_grace_minutes_non_negative CHECK (grace_minutes >= 0),
      CONSTRAINT shift_sessions_minimum_work_minutes_non_negative CHECK (minimum_work_minutes >= 0),
      CONSTRAINT shift_sessions_early_exit_tolerance_non_negative CHECK (early_exit_tolerance_minutes >= 0),
      CONSTRAINT shift_sessions_checkin_before_non_negative CHECK (checkin_before_minutes >= 0),
      CONSTRAINT shift_sessions_checkout_after_non_negative CHECK (checkout_after_minutes >= 0),
      CONSTRAINT shift_sessions_unique_shift_session UNIQUE (shift_id, session_number)
    );
  `);

  pgm.sql("CREATE INDEX IF NOT EXISTS shift_sessions_shift_id_idx ON shift_sessions (shift_id);");
  pgm.sql("CREATE TRIGGER shift_sessions_updated_at BEFORE UPDATE ON shift_sessions FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");

  pgm.sql(`
    ALTER TABLE daily_attendance_records
      ADD COLUMN IF NOT EXISTS session_records jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);

  pgm.sql(`
    INSERT INTO shift_sessions (
      shift_id,
      session_number,
      start_time,
      end_time,
      grace_minutes,
      minimum_work_minutes,
      early_exit_tolerance_minutes,
      checkin_before_minutes,
      checkout_after_minutes,
      crosses_midnight,
      active
    )
    SELECT
      id,
      1,
      start_time,
      end_time,
      grace_minutes,
      minimum_work_minutes,
      early_exit_tolerance_minutes,
      checkin_before_minutes,
      checkout_after_minutes,
      is_overnight,
      active
    FROM shifts
    ON CONFLICT (shift_id, session_number) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql("ALTER TABLE daily_attendance_records DROP COLUMN IF EXISTS session_records;");
  pgm.sql("DROP TABLE IF EXISTS shift_sessions;");
};
