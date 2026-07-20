import { getDatabasePool } from "../../infrastructure/database/database.js";
const pool = getDatabasePool();

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  minimum_work_minutes: number;
  is_overnight: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function getShifts(activeOnly?: boolean): Promise<Shift[]> {
  let query = "SELECT * FROM shifts";
  const params: unknown[] = [];
  
  if (activeOnly !== undefined) {
    query += " WHERE active = $1";
    params.push(activeOnly);
  }
  
  query += " ORDER BY name ASC";
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getShiftById(id: string): Promise<Shift | null> {
  const result = await pool.query("SELECT * FROM shifts WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function getShiftByName(name: string): Promise<Shift | null> {
  const result = await pool.query("SELECT * FROM shifts WHERE lower(name) = lower($1)", [name]);
  return result.rows[0] || null;
}

export async function createShift(shift: Omit<Shift, "id" | "created_at" | "updated_at">): Promise<Shift> {
  const result = await pool.query(
    `INSERT INTO shifts (name, start_time, end_time, grace_minutes, minimum_work_minutes, is_overnight, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      shift.name,
      shift.start_time,
      shift.end_time,
      shift.grace_minutes,
      shift.minimum_work_minutes,
      shift.is_overnight,
      shift.active,
    ]
  );
  return result.rows[0];
}

export async function updateShift(id: string, shift: Partial<Omit<Shift, "id" | "created_at" | "updated_at">>): Promise<Shift | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [id];
  let paramIdx = 2;
  
  for (const [key, value] of Object.entries(shift)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    }
  }
  
  if (setClauses.length === 0) return getShiftById(id);
  
  const query = `UPDATE shifts SET ${setClauses.join(", ")} WHERE id = $1 RETURNING *`;
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

export async function updateShiftStatus(id: string, active: boolean): Promise<Shift | null> {
  const result = await pool.query(
    "UPDATE shifts SET active = $1 WHERE id = $2 RETURNING *",
    [active, id]
  );
  return result.rows[0] || null;
}
