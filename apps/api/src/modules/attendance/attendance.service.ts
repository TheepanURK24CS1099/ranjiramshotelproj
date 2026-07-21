import * as repository from "./attendance.repository.js";
import type { AttendanceDashboardSummary, AttendanceException, AttendanceFilters, AttendanceRecord, AttendanceStatus } from "./attendance.repository.js";
import { getDatabasePool } from "../../infrastructure/database/database.js";

const pool = getDatabasePool();

const IST_OFFSET_MS = 330 * 60_000;

function currentIstDate(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function getAttendance(filters: AttendanceFilters): Promise<AttendanceRecord[]> {
  return await repository.listAttendance(filters);
}

export async function getAttendanceExceptions(date: string): Promise<AttendanceException[]> {
  return await repository.listAttendanceExceptions(date);
}

export async function getAttendanceSummary(date?: string): Promise<AttendanceDashboardSummary> {
  const summaryDate = date ?? currentIstDate();
  return await repository.getAttendanceSummary(summaryDate);
}

export async function rebuildAttendance(date: string): Promise<void> {
  await repository.rebuildAttendanceForDate(date);
}

export async function rebuildAttendanceForAllActiveEmployees(date: string): Promise<{ processed: number }> {
  return await repository.rebuildAttendanceForAllActiveEmployees(date);
}

function dates(date: string): string[] { if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error("Validation: A valid date is required"); return [date]; }
async function lockedAttendance(client: {query:typeof pool.query}, keys: string[]): Promise<boolean> { return ((await client.query(`SELECT 1 FROM daily_attendance_records a JOIN payroll_periods p ON a.employee_id IS NOT NULL AND a.attendance_date BETWEEN p.period_start AND p.period_end WHERE a.attendance_key=ANY($1) AND p.status='LOCKED' LIMIT 1`,[keys])).rowCount??0)>0; }
export async function deleteAttendance(keys: string[]): Promise<{ deleted:number }> { if(!keys.length)throw new Error("Validation: Select at least one attendance record"); const c=await pool.connect();try{await c.query("BEGIN");if(await lockedAttendance(c,keys))throw new Error("Conflict: This attendance is used by locked payroll history and cannot be deleted.");const r=await c.query("DELETE FROM daily_attendance_records WHERE attendance_key=ANY($1) RETURNING attendance_key",[keys]);await c.query("COMMIT");return {deleted:r.rowCount??0};}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
export async function clearAttendanceDate(date:string):Promise<{deleted:number}>{dates(date);const rows=await pool.query("SELECT attendance_key FROM daily_attendance_records WHERE attendance_date=$1",[date]);return deleteAttendance(rows.rows.map((r:{attendance_key:string})=>r.attendance_key));}
export async function resolveExceptions(ids:number[],userId:string,notes?:string):Promise<{resolved:number}>{if(!ids.length)throw new Error("Validation: Select at least one exception");const r=await pool.query("UPDATE attendance_exceptions SET resolved_by=$2,resolved_at=now(),resolution_notes=$3 WHERE raw_punch_id=ANY($1::bigint[]) AND resolved_at IS NULL",[ids,userId,notes??null]);return{resolved:r.rowCount??0};}
export async function deleteSafeExceptions(ids:number[]):Promise<{deleted:number}>{if(!ids.length)throw new Error("Validation: Select at least one exception");const r=await pool.query("DELETE FROM attendance_exceptions WHERE raw_punch_id=ANY($1::bigint[]) AND safe_to_delete=true RETURNING raw_punch_id",[ids]);return{deleted:r.rowCount??0};}

export type { AttendanceStatus };
