import { getDatabasePool } from "../../infrastructure/database/database.js";
const pool = getDatabasePool();

export interface ShiftSession {
  id: string;
  shift_id: string;
  session_number: number;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  minimum_work_minutes: number;
  early_exit_tolerance_minutes: number;
  checkin_before_minutes: number;
  checkout_after_minutes: number;
  crosses_midnight: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

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
  sessions?: ShiftSession[];
  created_at: Date;
  updated_at: Date;
}

export type ShiftSessionInput = Omit<ShiftSession, "id" | "shift_id" | "created_at" | "updated_at"> & { id?: string | undefined };

export type CreateShiftInput = {
  name: string;
  start_time?: string | undefined;
  end_time?: string | undefined;
  grace_minutes?: number | undefined;
  minimum_work_minutes?: number | undefined;
  early_exit_tolerance_minutes?: number | undefined;
  checkin_before_minutes?: number | undefined;
  checkout_after_minutes?: number | undefined;
  weekly_off_days?: number[] | undefined;
  is_overnight?: boolean | undefined;
  active?: boolean | undefined;
  sessions?: ShiftSessionInput[] | undefined;
};

export async function getShiftSessionsByShiftId(shiftId: string): Promise<ShiftSession[]> {
  const result = await pool.query<ShiftSession>(
    "SELECT * FROM shift_sessions WHERE shift_id = $1 AND active = true ORDER BY session_number ASC",
    [shiftId]
  );
  return result.rows;
}

async function attachSessionsToShifts(shifts: Shift[]): Promise<Shift[]> {
  if (shifts.length === 0) return shifts;
  const shiftIds = shifts.map((s) => s.id);
  const result = await pool.query<ShiftSession>(
    "SELECT * FROM shift_sessions WHERE shift_id = ANY($1::uuid[]) AND active = true ORDER BY session_number ASC",
    [shiftIds]
  );
  const sessionsByShiftId = new Map<string, ShiftSession[]>();
  for (const session of result.rows) {
    const list = sessionsByShiftId.get(session.shift_id) ?? [];
    list.push(session);
    sessionsByShiftId.set(session.shift_id, list);
  }

  return shifts.map((shift) => {
    const sessions = sessionsByShiftId.get(shift.id);
    if (sessions && sessions.length > 0) {
      return { ...shift, sessions };
    }
    // Fallback: create virtual session 1 if shift_sessions table has no row yet
    const fallbackSession: ShiftSession = {
      id: shift.id,
      shift_id: shift.id,
      session_number: 1,
      start_time: shift.start_time,
      end_time: shift.end_time,
      grace_minutes: shift.grace_minutes,
      minimum_work_minutes: shift.minimum_work_minutes,
      early_exit_tolerance_minutes: shift.early_exit_tolerance_minutes,
      checkin_before_minutes: shift.checkin_before_minutes,
      checkout_after_minutes: shift.checkout_after_minutes,
      crosses_midnight: shift.is_overnight,
      active: true,
      created_at: shift.created_at,
      updated_at: shift.updated_at,
    };
    return { ...shift, sessions: [fallbackSession] };
  });
}

export async function getShifts(activeOnly?: boolean): Promise<Shift[]> {
  let query = "SELECT * FROM shifts";
  const params: unknown[] = [];

  if (activeOnly !== undefined) {
    query += " WHERE active = $1";
    params.push(activeOnly);
  }

  query += " ORDER BY name ASC";

  const result = await pool.query<Shift>(query, params);
  return await attachSessionsToShifts(result.rows);
}

export async function getShiftById(id: string): Promise<Shift | null> {
  const result = await pool.query<Shift>("SELECT * FROM shifts WHERE id = $1", [id]);
  if (!result.rows[0]) return null;
  const attached = await attachSessionsToShifts([result.rows[0]]);
  return attached[0] ?? null;
}

export async function getShiftByName(name: string): Promise<Shift | null> {
  const result = await pool.query<Shift>("SELECT * FROM shifts WHERE lower(name) = lower($1)", [name]);
  if (!result.rows[0]) return null;
  const attached = await attachSessionsToShifts([result.rows[0]]);
  return attached[0] ?? null;
}

export async function createShift(input: CreateShiftInput): Promise<Shift> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sessionsInput = input.sessions && input.sessions.length > 0 ? input.sessions : null;

    let startTime = input.start_time ?? "09:00";
    let endTime = input.end_time ?? "17:00";
    let graceMinutes = input.grace_minutes ?? 0;
    let minWorkMinutes = input.minimum_work_minutes ?? 0;
    let earlyExitTol = input.early_exit_tolerance_minutes ?? 0;
    let checkinBefore = input.checkin_before_minutes ?? 0;
    let checkoutAfter = input.checkout_after_minutes ?? 60;
    let isOvernight = input.is_overnight ?? false;

    if (sessionsInput) {
      const sorted = [...sessionsInput].sort((a, b) => a.session_number - b.session_number);
      const s1 = sorted[0]!;
      const sLast = sorted[sorted.length - 1]!;

      startTime = s1.start_time;
      endTime = sLast.end_time;
      graceMinutes = s1.grace_minutes ?? 0;
      minWorkMinutes = sorted.reduce((sum, s) => sum + (s.minimum_work_minutes ?? 0), 0);
      earlyExitTol = sLast.early_exit_tolerance_minutes ?? 0;
      checkinBefore = s1.checkin_before_minutes ?? 0;
      checkoutAfter = sLast.checkout_after_minutes ?? 60;
      isOvernight = sorted.some((s) => s.crosses_midnight);
    }

    const shiftRes = await client.query<Shift>(
      `INSERT INTO shifts (
        name, start_time, end_time, grace_minutes, minimum_work_minutes,
        early_exit_tolerance_minutes, checkin_before_minutes, checkout_after_minutes,
        weekly_off_days, is_overnight, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        input.name,
        startTime,
        endTime,
        graceMinutes,
        minWorkMinutes,
        earlyExitTol,
        checkinBefore,
        checkoutAfter,
        input.weekly_off_days ?? [],
        isOvernight,
        input.active ?? true,
      ]
    );

    const shift = shiftRes.rows[0]!;

    const sessionsToCreate = sessionsInput ?? [
      {
        session_number: 1,
        start_time: startTime,
        end_time: endTime,
        grace_minutes: graceMinutes,
        minimum_work_minutes: minWorkMinutes,
        early_exit_tolerance_minutes: earlyExitTol,
        checkin_before_minutes: checkinBefore,
        checkout_after_minutes: checkoutAfter,
        crosses_midnight: isOvernight,
        active: true,
      },
    ];

    for (const session of sessionsToCreate) {
      await client.query(
        `INSERT INTO shift_sessions (
          shift_id, session_number, start_time, end_time,
          grace_minutes, minimum_work_minutes, early_exit_tolerance_minutes,
          checkin_before_minutes, checkout_after_minutes, crosses_midnight, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          shift.id,
          session.session_number,
          session.start_time,
          session.end_time,
          session.grace_minutes ?? 0,
          session.minimum_work_minutes ?? 0,
          session.early_exit_tolerance_minutes ?? 0,
          session.checkin_before_minutes ?? 0,
          session.checkout_after_minutes ?? 60,
          session.crosses_midnight ?? false,
          session.active ?? true,
        ]
      );
    }

    await client.query("COMMIT");
    return (await getShiftById(shift.id))!;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShift(id: string, input: Partial<CreateShiftInput>): Promise<Shift | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await getShiftById(id);
    if (!existing) {
      await client.query("ROLLBACK");
      return null;
    }

    const sessionsInput = input.sessions;
    if (sessionsInput && sessionsInput.length > 0) {
      const sorted = [...sessionsInput].sort((a, b) => a.session_number - b.session_number);
      const s1 = sorted[0]!;
      const sLast = sorted[sorted.length - 1]!;

      input.start_time = s1.start_time;
      input.end_time = sLast.end_time;
      input.grace_minutes = s1.grace_minutes ?? 0;
      input.minimum_work_minutes = sorted.reduce((sum, s) => sum + (s.minimum_work_minutes ?? 0), 0);
      input.early_exit_tolerance_minutes = sLast.early_exit_tolerance_minutes ?? 0;
      input.checkin_before_minutes = s1.checkin_before_minutes ?? 0;
      input.checkout_after_minutes = sLast.checkout_after_minutes ?? 60;
      input.is_overnight = sorted.some((s) => s.crosses_midnight);
    }

    const setClauses: string[] = [];
    const params: unknown[] = [id];
    let paramIdx = 2;

    const allowedFields = [
      "name",
      "start_time",
      "end_time",
      "grace_minutes",
      "minimum_work_minutes",
      "early_exit_tolerance_minutes",
      "checkin_before_minutes",
      "checkout_after_minutes",
      "weekly_off_days",
      "is_overnight",
      "active",
    ] as const;

    for (const field of allowedFields) {
      if (input[field] !== undefined) {
        setClauses.push(`${field} = $${paramIdx}`);
        params.push(input[field]);
        paramIdx++;
      }
    }

    if (setClauses.length > 0) {
      await client.query(`UPDATE shifts SET ${setClauses.join(", ")} WHERE id = $1`, params);
    }

    if (sessionsInput && sessionsInput.length > 0) {
      await client.query("DELETE FROM shift_sessions WHERE shift_id = $1", [id]);
      for (const session of sessionsInput) {
        await client.query(
          `INSERT INTO shift_sessions (
            shift_id, session_number, start_time, end_time,
            grace_minutes, minimum_work_minutes, early_exit_tolerance_minutes,
            checkin_before_minutes, checkout_after_minutes, crosses_midnight, active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            session.session_number,
            session.start_time,
            session.end_time,
            session.grace_minutes ?? 0,
            session.minimum_work_minutes ?? 0,
            session.early_exit_tolerance_minutes ?? 0,
            session.checkin_before_minutes ?? 0,
            session.checkout_after_minutes ?? 60,
            session.crosses_midnight ?? false,
            session.active ?? true,
          ]
        );
      }
    }

    await client.query("COMMIT");
    return await getShiftById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShiftStatus(id: string, active: boolean): Promise<Shift | null> {
  const result = await pool.query<Shift>("UPDATE shifts SET active = $1 WHERE id = $2 RETURNING *", [active, id]);
  if (!result.rows[0]) return null;
  return await getShiftById(id);
}

export async function deleteShiftIfUnused(id: string): Promise<boolean> {
  const history = await pool.query(
    "SELECT 1 FROM employee_shift_assignments WHERE shift_id=$1 UNION ALL SELECT 1 FROM daily_attendance_records WHERE shift_id=$1 LIMIT 1",
    [id]
  );
  if (history.rowCount) throw new Error("Cannot delete this shift because historical records exist. Deactivate the shift instead.");
  return (await pool.query("DELETE FROM shifts WHERE id=$1 RETURNING id", [id])).rowCount === 1;
}

export async function bulkStatus(ids: string[], active: boolean): Promise<number> {
  return (await pool.query("UPDATE shifts SET active=$2 WHERE id=ANY($1::uuid[])", [ids, active])).rowCount ?? 0;
}

export async function deleteUnused(ids: string[]): Promise<number> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const used = await c.query(
      "SELECT 1 FROM employee_shift_assignments WHERE shift_id=ANY($1::uuid[]) UNION ALL SELECT 1 FROM daily_attendance_records WHERE shift_id=ANY($1::uuid[]) LIMIT 1",
      [ids]
    );
    if (used.rowCount) throw new Error("Cannot delete this shift because historical records exist. Deactivate the shift instead.");
    const r = await c.query("DELETE FROM shifts WHERE id=ANY($1::uuid[])", [ids]);
    await c.query("COMMIT");
    return r.rowCount ?? 0;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
