/* eslint-disable no-undef */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE payroll_periods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      year integer NOT NULL,
      month integer NOT NULL,
      period_start date NOT NULL,
      period_end date NOT NULL,
      status text NOT NULL DEFAULT 'DRAFT',
      generated_at timestamptz,
      generated_by uuid REFERENCES app_users(id) ON DELETE RESTRICT,
      locked_at timestamptz,
      locked_by uuid REFERENCES app_users(id) ON DELETE RESTRICT,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT payroll_periods_year_month_unique UNIQUE(year, month),
      CONSTRAINT payroll_periods_month_check CHECK (month BETWEEN 1 AND 12),
      CONSTRAINT payroll_periods_status_check CHECK (status IN ('DRAFT','GENERATED','LOCKED','CANCELLED')),
      CONSTRAINT payroll_periods_boundaries_check CHECK (period_start = make_date(year, month, 1) AND period_end = (make_date(year, month, 1) + interval '1 month - 1 day')::date)
    );
    CREATE INDEX payroll_periods_status_idx ON payroll_periods(status);
    CREATE TRIGGER payroll_periods_updated_at BEFORE UPDATE ON payroll_periods FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();

    CREATE TABLE employee_payroll_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE RESTRICT,
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      salary_history_id uuid NOT NULL REFERENCES employee_salary_history(id) ON DELETE RESTRICT,
      salary_type text NOT NULL,
      base_salary numeric(12,2) NOT NULL,
      payable_days numeric(8,2) NOT NULL DEFAULT 0,
      present_days numeric(8,2) NOT NULL DEFAULT 0,
      late_days numeric(8,2) NOT NULL DEFAULT 0,
      half_days numeric(8,2) NOT NULL DEFAULT 0,
      absent_days numeric(8,2) NOT NULL DEFAULT 0,
      weekly_off_days numeric(8,2) NOT NULL DEFAULT 0,
      holiday_days numeric(8,2) NOT NULL DEFAULT 0,
      missing_punch_days numeric(8,2) NOT NULL DEFAULT 0,
      total_work_minutes integer NOT NULL DEFAULT 0,
      attendance_deduction numeric(12,2) NOT NULL DEFAULT 0,
      other_deductions numeric(12,2) NOT NULL DEFAULT 0,
      advance_recovery numeric(12,2) NOT NULL DEFAULT 0,
      gross_pay numeric(12,2) NOT NULL DEFAULT 0,
      net_pay numeric(12,2) NOT NULL DEFAULT 0,
      calculation_details jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'DRAFT',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT employee_payroll_records_period_employee_unique UNIQUE(payroll_period_id, employee_id),
      CONSTRAINT employee_payroll_records_salary_type_check CHECK (salary_type IN ('MONTHLY','DAILY','HOURLY')),
      CONSTRAINT employee_payroll_records_status_check CHECK (status IN ('DRAFT','APPROVED','PAID','CANCELLED')),
      CONSTRAINT employee_payroll_records_non_negative CHECK (base_salary >= 0 AND payable_days >= 0 AND present_days >= 0 AND late_days >= 0 AND half_days >= 0 AND absent_days >= 0 AND weekly_off_days >= 0 AND holiday_days >= 0 AND missing_punch_days >= 0 AND total_work_minutes >= 0 AND attendance_deduction >= 0 AND other_deductions >= 0 AND advance_recovery >= 0 AND gross_pay >= 0 AND net_pay >= 0)
    );
    CREATE INDEX employee_payroll_records_period_status_idx ON employee_payroll_records(payroll_period_id,status);
    CREATE INDEX employee_payroll_records_employee_idx ON employee_payroll_records(employee_id);
    CREATE TRIGGER employee_payroll_records_updated_at BEFORE UPDATE ON employee_payroll_records FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();

    CREATE TABLE payroll_deductions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_record_id uuid NOT NULL REFERENCES employee_payroll_records(id) ON DELETE RESTRICT,
      deduction_type text NOT NULL,
      amount numeric(12,2) NOT NULL,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT payroll_deductions_type_check CHECK (deduction_type IN ('OTHER','DAMAGE','LOAN','PENALTY')),
      CONSTRAINT payroll_deductions_amount_check CHECK (amount > 0)
    );
    CREATE INDEX payroll_deductions_record_idx ON payroll_deductions(payroll_record_id);
    CREATE TRIGGER payroll_deductions_updated_at BEFORE UPDATE ON payroll_deductions FOR EACH ROW EXECUTE FUNCTION hotel_updated_at_trigger();

    ALTER TABLE employee_advance_transactions ADD COLUMN payroll_record_id uuid REFERENCES employee_payroll_records(id) ON DELETE RESTRICT;
    CREATE UNIQUE INDEX employee_advance_transactions_payroll_repayment_idx ON employee_advance_transactions(payroll_record_id) WHERE payroll_record_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE employee_advance_transactions DROP COLUMN IF EXISTS payroll_record_id;');
  pgm.sql('DROP TABLE IF EXISTS payroll_deductions; DROP TABLE IF EXISTS employee_payroll_records; DROP TABLE IF EXISTS payroll_periods;');
};
