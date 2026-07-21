/* eslint-disable no-undef */

exports.up = (pgm) => pgm.sql(`
  CREATE TABLE payroll_reset_audits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_period_id uuid,
    employee_payroll_record_id uuid,
    payment_id uuid,
    action text NOT NULL,
    reason text NOT NULL,
    actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX payroll_reset_audits_period_idx ON payroll_reset_audits(payroll_period_id, created_at DESC);
  CREATE INDEX payroll_reset_audits_record_idx ON payroll_reset_audits(employee_payroll_record_id, created_at DESC);
  CREATE INDEX payroll_reset_audits_payment_idx ON payroll_reset_audits(payment_id, created_at DESC);
`);

exports.down = (pgm) => pgm.sql("DROP TABLE IF EXISTS payroll_reset_audits;");
