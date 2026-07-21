import * as repository from "./devices.repository.js";
import { getDatabasePool } from "../../infrastructure/database/database.js";
import { rebuildAttendanceForAllActiveEmployees } from "../attendance/attendance.service.js";
import { calculateDeviceStatus } from "./device-status.service.js";
import type { z } from "zod";
import type { createDeviceSchema, updateDeviceSchema } from "./devices.schema.js";

type CreateInput = z.infer<typeof createDeviceSchema>;
type UpdateInput = z.infer<typeof updateDeviceSchema>;
const pool=getDatabasePool();

function withStatus(device: repository.Device): repository.Device {
  return { ...device, status: calculateDeviceStatus(device.active, device.last_seen) };
}
export async function list() { return (await repository.list()).map(withStatus); }
export async function get(id: string) { const value = await repository.findById(id); return value ? withStatus(value) : null; }
export async function create(data: CreateInput) {
  if (await repository.findConflict(data.device_code, data.serial_number)) throw new Error("Conflict: Device code or serial number already exists");
  return withStatus(await repository.create({ ...data, name: data.name ?? null, model: data.model ?? null, serial_number: data.serial_number ?? null, firmware_version: data.firmware_version ?? null }));
}
export async function update(id: string, data: UpdateInput) {
  if (await repository.findConflict(data.device_code, data.serial_number, id)) throw new Error("Conflict: Device code or serial number already exists");
  const value = await repository.update(id, data); return value ? withStatus(value) : null;
}
export async function setActive(id: string, active: boolean) { const value = await repository.setActive(id, active); return value ? withStatus(value) : null; }
export async function recentPunches(id: string, limit: number) { if (!await repository.findById(id)) return null; return repository.recentPunches(id, limit); }
export async function updatePunchIgnore(ids:number[],ignored:boolean){if(!ids.length)throw new Error("Select at least one raw punch");const r=await pool.query("UPDATE raw_attendance_punches SET ignored=$2,ignored_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=ANY($1::bigint[])",[ids,ignored]);return{updated:r.rowCount??0};}
export async function deletePunches(ids:number[]){if(!ids.length)throw new Error("Select at least one raw punch");const c=await pool.connect();try{await c.query("BEGIN");const locked=await c.query(`SELECT 1 FROM raw_attendance_punches rp JOIN daily_attendance_records a ON rp.id IN (a.first_raw_punch_id,a.last_raw_punch_id,a.unmatched_raw_punch_id) JOIN payroll_periods p ON a.employee_id IS NOT NULL AND a.attendance_date BETWEEN p.period_start AND p.period_end WHERE rp.id=ANY($1::bigint[]) AND p.status='LOCKED' LIMIT 1`,[ids]);if(locked.rowCount)throw new Error("This punch contributes to locked payroll history and cannot be deleted.");const r=await c.query("DELETE FROM raw_attendance_punches WHERE id=ANY($1::bigint[]) RETURNING id",[ids]);await c.query("COMMIT");return{deleted:r.rowCount??0};}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
export async function reprocessPunches(ids:number[]){if(!ids.length)throw new Error("Select at least one raw punch");const rows=await pool.query("SELECT DISTINCT (punch_time AT TIME ZONE 'Asia/Kolkata')::date::text date FROM raw_attendance_punches WHERE id=ANY($1::bigint[]) AND ignored=false",[ids]);for(const row of rows.rows)await rebuildAttendanceForAllActiveEmployees(row.date);return{processed:rows.rowCount??0,skipped:ids.length-(rows.rowCount??0),failed:0};}
export async function clearTestPunches(date:string,endDate?:string){if(!/^\d{4}-\d{2}-\d{2}$/u.test(date)||endDate&&!/^\d{4}-\d{2}-\d{2}$/u.test(endDate))throw new Error("A valid date is required");const c=await pool.connect();try{await c.query("BEGIN");const range=endDate??date;const locked=await c.query(`SELECT 1 FROM raw_attendance_punches rp JOIN daily_attendance_records a ON rp.id IN (a.first_raw_punch_id,a.last_raw_punch_id,a.unmatched_raw_punch_id) JOIN payroll_periods p ON a.employee_id IS NOT NULL AND a.attendance_date BETWEEN p.period_start AND p.period_end WHERE (rp.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2 AND p.status='LOCKED' LIMIT 1`,[date,range]);if(locked.rowCount)throw new Error("This punch contributes to locked payroll history and cannot be deleted.");const r=await c.query("DELETE FROM raw_attendance_punches WHERE (punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2 AND source_event_key LIKE 'test%' RETURNING id",[date,range]);await c.query("COMMIT");return{deleted:r.rowCount??0,skipped:0,blocked:0};}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
