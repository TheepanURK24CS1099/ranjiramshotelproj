/* eslint-disable no-undef */
exports.up = (pgm) => {
  pgm.sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

  pgm.sql(`
    CREATE OR REPLACE FUNCTION hotel_updated_at_trigger()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$;
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS app_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT app_users_email_not_empty CHECK (length(trim(email)) > 0)
    );
  `);
  pgm.sql("CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_ci_idx ON app_users (lower(email));");
  pgm.sql("CREATE TRIGGER app_users_updated_at BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS shifts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      start_time time NOT NULL,
      end_time time NOT NULL,
      grace_minutes integer NOT NULL DEFAULT 0,
      minimum_work_minutes integer NOT NULL DEFAULT 0,
      is_overnight boolean NOT NULL DEFAULT false,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT shifts_grace_minutes_non_negative CHECK (grace_minutes >= 0),
      CONSTRAINT shifts_minimum_work_minutes_non_negative CHECK (minimum_work_minutes >= 0)
    );
  `);
  pgm.sql("CREATE UNIQUE INDEX IF NOT EXISTS shifts_name_ci_idx ON shifts (lower(name));");
  pgm.sql("CREATE TRIGGER shifts_updated_at BEFORE UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS employees (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      biometric_id bigint NOT NULL,
      name text NOT NULL,
      phone text,
      department text,
      designation text,
      joining_date date,
      weekly_off_day smallint,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT employees_biometric_id_positive CHECK (biometric_id > 0),
      CONSTRAINT employees_weekly_off_day_range CHECK (weekly_off_day IS NULL OR (weekly_off_day >= 0 AND weekly_off_day <= 6))
    );
  `);
  pgm.sql("CREATE UNIQUE INDEX IF NOT EXISTS employees_biometric_id_unique_idx ON employees (biometric_id);");
  pgm.sql("CREATE TRIGGER employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS employee_shift_assignments (
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
      effective_from date NOT NULL,
      effective_to date,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT employee_shift_assignments_pk PRIMARY KEY (employee_id, shift_id, effective_from),
      CONSTRAINT employee_shift_assignments_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
    );
  `);
  pgm.sql("CREATE INDEX IF NOT EXISTS employee_shift_assignments_employee_idx ON employee_shift_assignments (employee_id);");
  pgm.sql("CREATE INDEX IF NOT EXISTS employee_shift_assignments_effective_idx ON employee_shift_assignments (effective_from, effective_to);");
  pgm.sql("CREATE TRIGGER employee_shift_assignments_updated_at BEFORE UPDATE ON employee_shift_assignments FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS salary_history (
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      monthly_salary numeric(12,2) NOT NULL,
      effective_from date NOT NULL,
      effective_to date,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT salary_history_pk PRIMARY KEY (employee_id, effective_from),
      CONSTRAINT salary_history_positive CHECK (monthly_salary > 0),
      CONSTRAINT salary_history_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
    );
  `);
  pgm.sql("CREATE INDEX IF NOT EXISTS salary_history_employee_effective_idx ON salary_history (employee_id, effective_from, effective_to);");
  pgm.sql("CREATE TRIGGER salary_history_updated_at BEFORE UPDATE ON salary_history FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS advance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      type text NOT NULL,
      amount numeric(12,2) NOT NULL,
      transaction_date date NOT NULL,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT advance_transactions_amount_positive CHECK (amount > 0),
      CONSTRAINT advance_transactions_type_check CHECK (type IN ('OPENING_ADVANCE', 'ADVANCE', 'REPAYMENT', 'ADJUSTMENT'))
    );
  `);
  pgm.sql("CREATE INDEX IF NOT EXISTS advance_transactions_employee_date_idx ON advance_transactions (employee_id, transaction_date);");
  pgm.sql("CREATE TRIGGER advance_transactions_updated_at BEFORE UPDATE ON advance_transactions FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      device_code text NOT NULL,
      name text,
      model text,
      serial_number text,
      status text NOT NULL,
      last_seen timestamptz,
      last_ip inet,
      firmware_version text,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT devices_status_check CHECK (status IN ('ONLINE', 'OFFLINE'))
    );
  `);
  pgm.sql("CREATE UNIQUE INDEX IF NOT EXISTS devices_device_code_unique_idx ON devices (device_code);");
  pgm.sql("CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();");

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS raw_attendance_punches (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      device_id uuid REFERENCES devices(id) ON DELETE RESTRICT,
      biometric_id bigint,
      punch_time timestamptz NOT NULL,
      punch_state text,
      verify_mode text,
      source_event_key text UNIQUE,
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      received_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  pgm.sql("CREATE INDEX IF NOT EXISTS raw_attendance_punches_biometric_time_idx ON raw_attendance_punches (biometric_id, punch_time);");
  pgm.sql("CREATE INDEX IF NOT EXISTS raw_attendance_punches_device_time_idx ON raw_attendance_punches (device_id, punch_time);");
};

exports.down = (pgm) => {
  pgm.sql("DROP TABLE IF EXISTS raw_attendance_punches;");
  pgm.sql("DROP TABLE IF EXISTS devices;");
  pgm.sql("DROP TABLE IF EXISTS advance_transactions;");
  pgm.sql("DROP TABLE IF EXISTS salary_history;");
  pgm.sql("DROP TABLE IF EXISTS employee_shift_assignments;");
  pgm.sql("DROP TABLE IF EXISTS employees;");
  pgm.sql("DROP TABLE IF EXISTS shifts;");
  pgm.sql("DROP TABLE IF EXISTS app_users;");
  pgm.sql("DROP FUNCTION IF EXISTS hotel_updated_at_trigger();");
};
