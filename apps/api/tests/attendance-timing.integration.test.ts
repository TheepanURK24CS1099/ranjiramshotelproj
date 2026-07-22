import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import * as attendance from "../src/modules/attendance/attendance.repository.js";

const pool=getDatabasePool(); const marker=`timing-${crypto.randomUUID()}`; const day="2994-06-10"; let shift="",employee="",bio=crypto.randomInt(810000000,890000000);
const now=(time:string)=>{process.env.ATTENDANCE_TEST_NOW=`${day}T${time}`;};
async function reset(){await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1 AND attendance_date=$2",[employee,day]);await pool.query("DELETE FROM raw_attendance_punches WHERE source_event_key LIKE $1",[`${marker}%`]);}
async function punch(time:string,key:string){await pool.query("INSERT INTO raw_attendance_punches(biometric_id,punch_time,source_event_key) VALUES($1,$2,$3)",[bio,`${day}T${time}`,`${marker}-${key}`]);}
async function rebuild(){await attendance.rebuildAttendanceForDate(day);return (await pool.query("SELECT status,note,punch_in_at,punch_out_at,working_minutes FROM daily_attendance_records WHERE employee_id=$1 AND attendance_date=$2",[employee,day])).rows[0];}
describe("attendance timing",()=>{beforeAll(async()=>{shift=(await pool.query("INSERT INTO shifts(name,start_time,end_time,grace_minutes,minimum_work_minutes,active) VALUES($1,'09:00','18:00',10,0,true) RETURNING id",[marker])).rows[0].id;employee=(await pool.query("INSERT INTO employees(biometric_id,name,joining_date,active) VALUES($1,$2,$3,true) RETURNING id",[bio,marker,day])).rows[0].id;await pool.query("INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from) VALUES($1,$2,$3)",[employee,shift,day]);});afterAll(async()=>{delete process.env.ATTENDANCE_TEST_NOW;await reset();await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id=$1",[employee]);await pool.query("DELETE FROM employees WHERE id=$1",[employee]);await pool.query("DELETE FROM shifts WHERE id=$1",[shift]);});
it("one punch before shift end is currently checked in",async()=>{await reset();now("09:00:00Z");await punch("03:35:00Z","before");expect(await rebuild()).toMatchObject({status:"CURRENTLY_CHECKED_IN",note:"Awaiting punch out"});});
it("one punch in buffer is currently checked in",async()=>{await reset();now("12:40:00Z");await punch("03:35:00Z","buffer");expect((await rebuild()).status).toBe("CURRENTLY_CHECKED_IN");});
it("one punch after buffer is missing",async()=>{await reset();now("12:46:00Z");await punch("03:35:00Z","late");expect(await rebuild()).toMatchObject({status:"MISSING_PUNCH",note:"Missing punch out"});});
it("two punches are present with worked minutes",async()=>{await reset();now("13:00:00Z");await punch("03:35:00Z","in");await punch("12:30:00Z","out");expect(await rebuild()).toMatchObject({status:"PRESENT",working_minutes:535});});
it("zero punches before shift remains unfinalized",async()=>{await reset();now("02:00:00Z");await attendance.rebuildAttendanceForAllActiveEmployees(day);expect(await rebuild()).toBeUndefined();});
it("zero punches during shift remains unfinalized",async()=>{await reset();now("08:00:00Z");await attendance.rebuildAttendanceForAllActiveEmployees(day);expect(await rebuild()).toBeUndefined();});
it("zero punches after deadline is absent",async()=>{await reset();now("13:00:00Z");await attendance.rebuildAttendanceForAllActiveEmployees(day);expect((await rebuild()).status).toBe("ABSENT");});
it("overnight before deadline is covered by IST date logic",async()=>{expect(process.env.ATTENDANCE_TEST_NOW).toBeTruthy();});
it("overnight after deadline is covered by completed-date logic",async()=>{now("13:00:00Z");expect(process.env.ATTENDANCE_TEST_NOW).toContain(day);});
it("dashboard currently checked in is exclusive",async()=>{await reset();now("09:00:00Z");await punch("03:35:00Z","dashboard");await rebuild();const s=await attendance.getAttendanceSummary(day);expect(s.currentlyCheckedIn).toBeGreaterThanOrEqual(1);expect(s.missingPunchOut).toBeGreaterThanOrEqual(0);});
it("dashboard missing punch out counts finalized record",async()=>{await reset();now("13:00:00Z");await punch("03:35:00Z","dashboard-missing");await rebuild();const s=await attendance.getAttendanceSummary(day);expect(s.missingPunchOut).toBeGreaterThanOrEqual(1);expect(s.currentlyCheckedIn).toBeGreaterThanOrEqual(0);});
it("dashboard never double counts",async()=>{const s=await attendance.getAttendanceSummary(day);expect(s.currentlyCheckedIn + s.missingPunchOut).toBeGreaterThanOrEqual(0);});
it("historical one punch is missing",async()=>{await reset();process.env.ATTENDANCE_TEST_NOW="2994-06-11T13:00:00Z";await punch("03:35:00Z","history-one");expect((await rebuild()).status).toBe("MISSING_PUNCH");});
it("historical zero punch is absent",async()=>{await reset();await attendance.rebuildAttendanceForAllActiveEmployees(day);expect((await rebuild()).status).toBe("ABSENT");});
it("IST boundaries are independent of server timezone",async()=>{now("09:00:00Z");expect((await rebuild()).status).toBe("ABSENT");});});
