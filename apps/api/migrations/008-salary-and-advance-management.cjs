/* eslint-disable no-undef */

exports.up = (pgm) => {
  pgm.sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");
  pgm.sql(`
    CREATE TABLE employee_salary_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      salary_type text NOT NULL,
      monthly_salary numeric(12,2),
      daily_rate numeric(12,2),
      hourly_rate numeric(12,2),
      effective_from date NOT NULL,
      effective_to date,
      active boolean NOT NULL DEFAULT true,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT employee_salary_history_type_check CHECK (salary_type IN ('MONTHLY','DAILY','HOURLY')),
      CONSTRAINT employee_salary_history_period_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
      CONSTRAINT employee_salary_history_amount_check CHECK (
        (salary_type = 'MONTHLY' AND monthly_salary > 0 AND daily_rate IS NULL AND hourly_rate IS NULL)
        OR (salary_type = 'DAILY' AND daily_rate > 0 AND monthly_salary IS NULL AND hourly_rate IS NULL)
        OR (salary_type = 'HOURLY' AND hourly_rate > 0 AND monthly_salary IS NULL AND daily_rate IS NULL)
      )
    );
    ALTER TABLE employee_salary_history
      ADD CONSTRAINT employee_salary_history_active_period_exclusion
      EXCLUDE USING gist (
        employee_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
      ) WHERE (active);
    CREATE INDEX employee_salary_history_employee_date_idx ON employee_salary_history(employee_id, effective_from DESC);
    CREATE TRIGGER employee_salary_history_updated_at BEFORE UPDATE ON employee_salary_history FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();

    CREATE TABLE employee_advance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      transaction_type text NOT NULL,
      amount numeric(12,2) NOT NULL,
      transaction_date date NOT NULL,
      notes text,
      created_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT employee_advance_transactions_type_check CHECK (transaction_type IN ('OPENING_ADVANCE','ADVANCE_GIVEN','REPAYMENT','ADJUSTMENT')),
      CONSTRAINT employee_advance_transactions_amount_check CHECK (
        (transaction_type IN ('OPENING_ADVANCE','ADVANCE_GIVEN','REPAYMENT') AND amount > 0)
        OR (transaction_type = 'ADJUSTMENT' AND amount <> 0)
      )
    );
    CREATE UNIQUE INDEX employee_advance_transactions_one_opening_idx
      ON employee_advance_transactions(employee_id) WHERE transaction_type = 'OPENING_ADVANCE';
    CREATE INDEX employee_advance_transactions_employee_date_idx
      ON employee_advance_transactions(employee_id, transaction_date DESC, created_at DESC);
    CREATE TRIGGER employee_advance_transactions_updated_at BEFORE UPDATE ON employee_advance_transactions FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP TABLE IF EXISTS employee_advance_transactions;");
  pgm.sql("DROP TABLE IF EXISTS employee_salary_history;");
};
