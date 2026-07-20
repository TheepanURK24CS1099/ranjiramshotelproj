import { getDatabasePool } from "../../infrastructure/database/database.js";
const pool = getDatabasePool();

const IST_OFFSET_MS = 330 * 60_000;

function currentIstDate(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function getDashboardSummary() {
  const attendanceDate = currentIstDate();
  const result = await pool.query(
    `WITH employee_counts AS (
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
    ),
    attendance_counts AS (
      SELECT
        COUNT(*) FILTER (WHERE status = 'PRESENT') as present_today,
        COUNT(*) FILTER (WHERE status = 'MISSING_PUNCH' AND punch_out_at IS NULL) as currently_checked_in,
        COUNT(*) FILTER (WHERE status = 'MISSING_PUNCH') as missing_punch_out,
        COUNT(*) FILTER (WHERE status = 'UNMATCHED') as unmatched_punches
      FROM daily_attendance_records
      WHERE attendance_date = $1::date
    )
    SELECT
      e.total_employees,
      e.active_employees,
      e.inactive_employees,
      s.active_shifts,
      w.no_shift_employees,
      a.present_today,
      a.currently_checked_in,
      a.missing_punch_out,
      a.unmatched_punches
    FROM employee_counts e
    CROSS JOIN shift_counts s
    CROSS JOIN employees_without_shift w
    CROSS JOIN attendance_counts a`,
    [attendanceDate],
  );

  const row = result.rows[0];
  return {
    totalEmployees: parseInt(row.total_employees, 10),
    activeEmployees: parseInt(row.active_employees, 10),
    inactiveEmployees: parseInt(row.inactive_employees, 10),
    activeShifts: parseInt(row.active_shifts, 10),
    employeesWithoutCurrentShift: parseInt(row.no_shift_employees, 10),
    presentToday: parseInt(row.present_today, 10),
    currentlyCheckedIn: parseInt(row.currently_checked_in, 10),
    missingPunchOut: parseInt(row.missing_punch_out, 10),
    unmatchedPunches: parseInt(row.unmatched_punches, 10),
  };
}
