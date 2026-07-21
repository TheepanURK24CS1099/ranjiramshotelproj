import { getDatabasePool } from "../../infrastructure/database/database.js";
const pool = getDatabasePool();

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  minimum_work_minutes: number;
  early_exit_tolerance_minutes: number;
  checkin_before_minutes: number;
  checkout_after_minutes: number;
  weekly_off_days: number[];
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
    `INSERT INTO shifts (name, start_time, end_time, grace_minutes, minimum_work_minutes, early_exit_tolerance_minutes, checkin_before_minutes, checkout_after_minutes, weekly_off_days, is_overnight, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      shift.name,
      shift.start_time,
      shift.end_time,
      shift.grace_minutes,
      shift.minimum_work_minutes,
      shift.early_exit_tolerance_minutes,
      shift.checkin_before_minutes,
      shift.checkout_after_minutes,
      shift.weekly_off_days,
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

export async function deleteShiftIfUnused(id: string): Promise<boolean> {
  const history=await pool.query("SELECT 1 FROM employee_shift_assignments WHERE shift_id=$1 UNION ALL SELECT 1 FROM daily_attendance_records WHERE shift_id=$1 LIMIT 1",[id]);
  if(history.rowCount) throw new Error("Cannot delete this shift because historical records exist. Deactivate the shift instead.");
  return (await pool.query("DELETE FROM shifts WHERE id=$1 RETURNING id",[id])).rowCount===1;
}
export async function bulkStatus(ids:string[],active:boolean):Promise<number>{return (await pool.query("UPDATE shifts SET active=$2 WHERE id=ANY($1::uuid[])",[ids,active])).rowCount??0;}
export async function deleteUnused(ids:string[]):Promise<number>{const c=await pool.connect();try{await c.query("BEGIN");const used=await c.query("SELECT 1 FROM employee_shift_assignments WHERE shift_id=ANY($1::uuid[]) UNION ALL SELECT 1 FROM daily_attendance_records WHERE shift_id=ANY($1::uuid[]) LIMIT 1",[ids]);if(used.rowCount)throw new Error("Cannot delete this shift because historical records exist. Deactivate the shift instead.");const r=await c.query("DELETE FROM shifts WHERE id=ANY($1::uuid[])",[ids]);await c.query("COMMIT");return r.rowCount??0;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
