import { getDatabasePool } from "../../infrastructure/database/database.js";
const pool = getDatabasePool();

export interface Employee {
  id: string;
  biometric_id: number;
  name: string;
  phone: string | null;
  department: string | null;
  designation: string | null;
  joining_date: Date;
  weekly_off_day: number | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ShiftAssignment {
  employee_id: string;
  shift_id: string;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Date;
  updated_at: Date;
  shift_name?: string; // joined field
}

export interface EmployeesListOptions {
  page: number;
  limit: number;
  search?: string;
  active?: boolean;
}

export async function getEmployees(options: EmployeesListOptions): Promise<{ data: Employee[]; total: number }> {
  const { page, limit, search, active } = options;
  const offset = (page - 1) * limit;

  let query = "SELECT * FROM employees WHERE 1=1";
  let countQuery = "SELECT COUNT(*) FROM employees WHERE 1=1";
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  let paramIdx = 1;

  if (active !== undefined) {
    query += ` AND active = $${paramIdx}`;
    countQuery += ` AND active = $${paramIdx}`;
    params.push(active);
    countParams.push(active);
    paramIdx++;
  }

  if (search) {
    const searchTerms = `%${search}%`;
    const searchCondition = ` AND (
      name ILIKE $${paramIdx} OR
      phone ILIKE $${paramIdx} OR
      department ILIKE $${paramIdx} OR
      designation ILIKE $${paramIdx} OR
      CAST(biometric_id AS TEXT) ILIKE $${paramIdx}
    )`;
    query += searchCondition;
    countQuery += searchCondition;
    params.push(searchTerms);
    countParams.push(searchTerms);
    paramIdx++;
  }

  query += ` ORDER BY name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(limit, offset);

  const [dataResult, countResult] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery, countParams),
  ]);

  return {
    data: dataResult.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const result = await pool.query("SELECT * FROM employees WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function getEmployeeByBiometricId(biometricId: number): Promise<Employee | null> {
  const result = await pool.query("SELECT * FROM employees WHERE biometric_id = $1", [biometricId]);
  return result.rows[0] || null;
}

export async function createEmployee(
  employee: Omit<Employee, "id" | "created_at" | "updated_at">,
  initialShift?: { shift_id: string; effective_from: string }
): Promise<Employee> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const empResult = await client.query(
      `INSERT INTO employees (biometric_id, name, phone, department, designation, joining_date, weekly_off_day, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        employee.biometric_id,
        employee.name,
        employee.phone,
        employee.department,
        employee.designation,
        employee.joining_date,
        employee.weekly_off_day,
        employee.active,
      ]
    );

    const newEmp = empResult.rows[0];

    if (initialShift) {
      await client.query(
        `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
         VALUES ($1, $2, $3)`,
        [newEmp.id, initialShift.shift_id, initialShift.effective_from]
      );
    }

    await client.query("COMMIT");
    return newEmp;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateEmployee(id: string, employee: Partial<Omit<Employee, "id" | "created_at" | "updated_at">>): Promise<Employee | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [id];
  let paramIdx = 2;

  for (const [key, value] of Object.entries(employee)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    }
  }

  if (setClauses.length === 0) return getEmployeeById(id);

  const query = `UPDATE employees SET ${setClauses.join(", ")} WHERE id = $1 RETURNING *`;
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

export async function updateEmployeeStatus(id: string, active: boolean): Promise<Employee | null> {
  const result = await pool.query("UPDATE employees SET active = $1 WHERE id = $2 RETURNING *", [active, id]);
  return result.rows[0] || null;
}

export async function getEmployeeShiftAssignments(employeeId: string): Promise<ShiftAssignment[]> {
  const result = await pool.query(
    `SELECT a.*, s.name as shift_name
     FROM employee_shift_assignments a
     JOIN shifts s ON a.shift_id = s.id
     WHERE a.employee_id = $1
     ORDER BY a.effective_from DESC`,
    [employeeId]
  );
  return result.rows;
}

export async function assignShift(employeeId: string, shiftId: string, effectiveFrom: string): Promise<ShiftAssignment> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Close any existing assignment that covers or precedes the new assignment date, and has no effective_to
    // The previous assignment will effectively end the day before the new one starts.
    // If there is an existing assignment exactly starting on the same date, reject it.

    // Check for identical start date
    const existingExact = await client.query(
      `SELECT * FROM employee_shift_assignments
       WHERE employee_id = $1 AND effective_from = $2`,
      [employeeId, effectiveFrom]
    );
    if (existingExact.rowCount && existingExact.rowCount > 0) {
      throw new Error("Conflict: A shift assignment already exists starting on this exact date");
    }

    // Check for overlapping open assignment that starts after this one
    const overlappingFuture = await client.query(
      `SELECT * FROM employee_shift_assignments
       WHERE employee_id = $1 AND effective_from > $2`,
      [employeeId, effectiveFrom]
    );
    if (overlappingFuture.rowCount && overlappingFuture.rowCount > 0) {
      throw new Error("Conflict: Cannot insert a past assignment if a future one already exists. Please adjust historical records manually if needed.");
    }

    // Close the most recent assignment
    await client.query(
      `UPDATE employee_shift_assignments
       SET effective_to = ($2::date - INTERVAL '1 day')
       WHERE employee_id = $1
         AND effective_to IS NULL
         AND effective_from < $2`,
      [employeeId, effectiveFrom]
    );

    // Insert new assignment
    const insertResult = await client.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, effective_from)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [employeeId, shiftId, effectiveFrom]
    );

    await client.query("COMMIT");
    return insertResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
