/* global exports */

exports.up = (pgm) => {
  pgm.sql("ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_code text;");
  pgm.sql("CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_code_unique_idx ON employees (employee_code) WHERE employee_code IS NOT NULL;");
};

exports.down = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS employees_employee_code_unique_idx;");
  pgm.sql("ALTER TABLE employees DROP COLUMN IF EXISTS employee_code;");
};
