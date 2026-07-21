import { getDatabasePool } from "../../infrastructure/database/database.js";

const pool = getDatabasePool();

export interface SalaryRecord {
  id: string;
  employee_id: string;
  salary_type: "MONTHLY" | "DAILY" | "HOURLY";
  monthly_salary: string | null;
  daily_rate: string | null;
  hourly_rate: string | null;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSalaryInput {
  salary_type: SalaryRecord["salary_type"];
  monthly_salary?: string | null | undefined;
  daily_rate?: string | null | undefined;
  hourly_rate?: string | null | undefined;
  effective_from: string;
  effective_to?: string | null | undefined;
  active: boolean;
  notes?: string | null | undefined;
}

export async function employeeExists(employeeId: string): Promise<boolean> {
  return (await pool.query("SELECT 1 FROM employees WHERE id=$1", [employeeId])).rowCount === 1;
}

export async function listSalaries(employeeId: string): Promise<SalaryRecord[]> {
  return (await pool.query<SalaryRecord>("SELECT id,employee_id,salary_type,monthly_salary,daily_rate,hourly_rate,effective_from::text,effective_to::text,active,notes,created_at,updated_at FROM employee_salary_history WHERE employee_id=$1 ORDER BY effective_from DESC,created_at DESC", [employeeId])).rows;
}

export async function getCurrentSalary(employeeId: string, date: string): Promise<SalaryRecord | null> {
  const result = await pool.query<SalaryRecord>("SELECT id,employee_id,salary_type,monthly_salary,daily_rate,hourly_rate,effective_from::text,effective_to::text,active,notes,created_at,updated_at FROM employee_salary_history WHERE employee_id=$1 AND active=true AND effective_from <= $2::date AND (effective_to IS NULL OR effective_to >= $2::date) ORDER BY effective_from DESC LIMIT 1", [employeeId, date]);
  return result.rows[0] ?? null;
}

export async function createSalary(employeeId: string, input: CreateSalaryInput): Promise<SalaryRecord> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.active) {
      const conflict = await client.query(
        "SELECT id FROM employee_salary_history WHERE employee_id=$1 AND active=true AND effective_from >= $2::date LIMIT 1",
        [employeeId, input.effective_from],
      );
      if (conflict.rowCount) throw new Error("Conflict: An active salary configuration already starts on or after this effective date");
      await client.query(
        `UPDATE employee_salary_history
         SET effective_to = ($2::date - INTERVAL '1 day')::date
         WHERE employee_id=$1 AND active=true AND effective_from < $2::date
           AND (effective_to IS NULL OR effective_to >= $2::date)`,
        [employeeId, input.effective_from],
      );
    }
    const result = await client.query<SalaryRecord>(
      `INSERT INTO employee_salary_history(employee_id,salary_type,monthly_salary,daily_rate,hourly_rate,effective_from,effective_to,active,notes)
       VALUES($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9)
       RETURNING id,employee_id,salary_type,monthly_salary,daily_rate,hourly_rate,effective_from::text,effective_to::text,active,notes,created_at,updated_at`,
      [employeeId, input.salary_type, input.monthly_salary, input.daily_rate, input.hourly_rate, input.effective_from, input.effective_to, input.active, input.notes],
    );
    await client.query("COMMIT");
    return result.rows[0]!;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateSalary(employeeId: string, salaryId: string, input: { effective_to?: string | null | undefined; notes?: string | null | undefined }): Promise<SalaryRecord | null> {
  const result = await pool.query<SalaryRecord>(
    `UPDATE employee_salary_history SET
       effective_to=CASE WHEN $3 THEN $4::date ELSE effective_to END,
       notes=CASE WHEN $5 THEN $6 ELSE notes END
     WHERE id=$1 AND employee_id=$2
     RETURNING id,employee_id,salary_type,monthly_salary,daily_rate,hourly_rate,effective_from::text,effective_to::text,active,notes,created_at,updated_at`,
    [salaryId, employeeId, input.effective_to !== undefined, input.effective_to ?? null, input.notes !== undefined, input.notes ?? null],
  );
  return result.rows[0] ?? null;
}

export async function updateSalaryStatus(employeeId: string, salaryId: string, active: boolean): Promise<SalaryRecord | null> {
  const result = await pool.query<SalaryRecord>(
    "UPDATE employee_salary_history SET active=$3 WHERE id=$1 AND employee_id=$2 RETURNING id,employee_id,salary_type,monthly_salary,daily_rate,hourly_rate,effective_from::text,effective_to::text,active,notes,created_at,updated_at",
    [salaryId, employeeId, active],
  );
  return result.rows[0] ?? null;
}
