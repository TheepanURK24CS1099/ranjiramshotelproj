/* eslint-disable no-undef */

exports.up = (pgm) => pgm.sql(`
  ALTER TABLE payroll_periods
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES app_users(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS approval_notes text,
    ADD COLUMN IF NOT EXISTS paid_at timestamptz,
    ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES app_users(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS payment_reference text,
    ADD COLUMN IF NOT EXISTS payment_notes text;

  ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_status_check;
  ALTER TABLE payroll_periods ADD CONSTRAINT payroll_periods_status_check
    CHECK (status IN ('DRAFT','GENERATED','APPROVED','PAID','LOCKED','CANCELLED'));

  ALTER TABLE payroll_payments
    ADD COLUMN IF NOT EXISTS payroll_period_id uuid REFERENCES payroll_periods(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS amount numeric(12,2),
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PAID',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
  ALTER TABLE payroll_payments ADD CONSTRAINT payroll_payments_status_check CHECK (status IN ('PAID','REVERSED'));
  ALTER TABLE payroll_payments ADD CONSTRAINT payroll_payments_amount_check CHECK (amount IS NULL OR amount >= 0);
  CREATE INDEX IF NOT EXISTS payroll_payments_period_idx ON payroll_payments(payroll_period_id, payment_date);
  CREATE INDEX IF NOT EXISTS payroll_payments_employee_idx ON payroll_payments(employee_id, payment_date);
  CREATE TRIGGER payroll_payments_updated_at BEFORE UPDATE ON payroll_payments FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();

  CREATE TABLE payroll_slips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE RESTRICT,
    employee_payroll_record_id uuid NOT NULL UNIQUE REFERENCES employee_payroll_records(id) ON DELETE RESTRICT,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    slip_number text NOT NULL UNIQUE,
    generated_at timestamptz NOT NULL DEFAULT now(),
    generated_by uuid REFERENCES app_users(id) ON DELETE RESTRICT
  );
  CREATE INDEX payroll_slips_period_idx ON payroll_slips(payroll_period_id, employee_id);

  CREATE TABLE payroll_payment_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_payment_id uuid NOT NULL REFERENCES payroll_payments(id) ON DELETE RESTRICT,
    action text NOT NULL,
    reason text NOT NULL,
    created_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payroll_payment_audit_action_check CHECK (action = 'REVERSED')
  );
  CREATE UNIQUE INDEX payroll_payment_audit_one_reversal_idx ON payroll_payment_audit(payroll_payment_id) WHERE action = 'REVERSED';
`);

exports.down = (pgm) => pgm.sql(`
  DROP TABLE IF EXISTS payroll_payment_audit;
  DROP TABLE IF EXISTS payroll_slips;
  DROP TRIGGER IF EXISTS payroll_payments_updated_at ON payroll_payments;
  DROP INDEX IF EXISTS payroll_payments_employee_idx;
  DROP INDEX IF EXISTS payroll_payments_period_idx;
  ALTER TABLE payroll_payments DROP CONSTRAINT IF EXISTS payroll_payments_amount_check;
  ALTER TABLE payroll_payments DROP CONSTRAINT IF EXISTS payroll_payments_status_check;
  ALTER TABLE payroll_payments DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS amount, DROP COLUMN IF EXISTS employee_id, DROP COLUMN IF EXISTS payroll_period_id;
  ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_status_check;
  ALTER TABLE payroll_periods ADD CONSTRAINT payroll_periods_status_check CHECK (status IN ('DRAFT','GENERATED','LOCKED','CANCELLED'));
  ALTER TABLE payroll_periods DROP COLUMN IF EXISTS payment_notes, DROP COLUMN IF EXISTS payment_reference, DROP COLUMN IF EXISTS paid_by, DROP COLUMN IF EXISTS paid_at, DROP COLUMN IF EXISTS approval_notes, DROP COLUMN IF EXISTS approved_by, DROP COLUMN IF EXISTS approved_at;
`);
