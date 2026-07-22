import { env } from "../../config/environment.js";
import { logger } from "../../config/logger.js";
import { getDatabasePool } from "../../infrastructure/database/database.js";
import { rebuildAttendanceForAllActiveEmployees } from "./attendance.repository.js";

const LOCK_KEY = 19019018;
const IST_OFFSET_MS = 330 * 60_000;
let timer: NodeJS.Timeout | undefined;
let running = false;
function istDate(value: Date): string { return new Date(value.getTime()+IST_OFFSET_MS).toISOString().slice(0,10); }
function previous(date: string): string { const value=new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate()-1); return value.toISOString().slice(0,10); }

export async function evaluateCurrentAttendanceStatuses(now = new Date()): Promise<{ evaluated: number; skipped: boolean }> {
  if (running) return { evaluated: 0, skipped: true };
  running=true; const started=Date.now(); const client=await getDatabasePool().connect();
  try { const locked=(await client.query<{locked:boolean}>("SELECT pg_try_advisory_lock($1) locked",[LOCK_KEY])).rows[0]?.locked; if(!locked) return {evaluated:0,skipped:true}; const today=istDate(now); const results=await Promise.allSettled([rebuildAttendanceForAllActiveEmployees(today),rebuildAttendanceForAllActiveEmployees(previous(today))]); const evaluated=results.reduce((sum,result)=>sum+(result.status==="fulfilled"?result.value.processed:0),0); const errors=results.filter(result=>result.status==="rejected").length; logger.info({job:"attendance-status-evaluator",evaluated,errors,durationMs:Date.now()-started},"Attendance status evaluation complete"); return {evaluated,skipped:false}; }
  finally { try { await client.query("SELECT pg_advisory_unlock($1)",[LOCK_KEY]); } finally { client.release(); running=false; } }
}
export function startAttendanceStatusScheduler(): void { if(timer || !env.ATTENDANCE_SCHEDULER_ENABLED || env.NODE_ENV==="test") return; timer=setInterval(()=>void evaluateCurrentAttendanceStatuses().catch(error=>logger.error({err:error,job:"attendance-status-evaluator"},"Attendance evaluator failed")),60_000); timer.unref(); }
export function stopAttendanceStatusScheduler(): void { if(timer) clearInterval(timer); timer=undefined; }
export function attendanceSchedulerStarted(): boolean { return timer!==undefined; }
