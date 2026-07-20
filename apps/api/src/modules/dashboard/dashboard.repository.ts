import { getDatabasePool } from "../../infrastructure/database/database.js";
const pool = getDatabasePool();

export async function getDashboardSummary() {
  const result = await pool.query(`
    WITH employee_counts AS (
      SELECT
        COUNT(*) as total_employees,
        COUNT(*) FILTER (WHERE active = true) as active_employees,
        COUNT(*) FILTER (WHERE active = false) as inactive_employees
      FROM employees
    ),
    shift_counts AS (
      SELECT COUNT(*) as active_shifts
      FROM shifts
      WHERE active = true
    ),
    employees_without_shift AS (
      SELECT COUNT(e.id) as no_shift_employees
      FROM employees e
      WHERE e.active = true
        AND NOT EXISTS (
          SELECT 1
          FROM employee_shift_assignments esa
          WHERE esa.employee_id = e.id
            AND esa.effective_from <= CURRENT_DATE
            AND (esa.effective_to IS NULL OR esa.effective_to >= CURRENT_DATE)
        )
    )
    SELECT
      e.total_employees,
      e.active_employees,
      e.inactive_employees,
      s.active_shifts,
      w.no_shift_employees
    FROM employee_counts e
    CROSS JOIN shift_counts s
    CROSS JOIN employees_without_shift w;
  `);

  const row = result.rows[0];
  return {
    totalEmployees: parseInt(row.total_employees, 10),
    activeEmployees: parseInt(row.active_employees, 10),
    inactiveEmployees: parseInt(row.inactive_employees, 10),
    activeShifts: parseInt(row.active_shifts, 10),
    employeesWithoutCurrentShift: parseInt(row.no_shift_employees, 10),
  };
}
