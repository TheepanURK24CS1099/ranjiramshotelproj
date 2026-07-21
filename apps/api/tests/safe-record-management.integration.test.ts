import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `safe-record-${crypto.randomUUID()}`;
const year = crypto.randomInt(2200, 2400);
const date = `${year}-01-15`;
const bio = crypto.randomInt(100_000_000, 900_000_000);
let admin = "";
let manager = "";
let shiftId = "";
let employeeId = "";

async function session(role: "ADMIN" | "MANAGER") {
  const user = (await pool.query("INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test-only',$3,true) RETURNING id", [`${marker}-${role}@test.invalid`, `${marker}-${role}`, role])).rows[0];
  const token = crypto.randomBytes(32).toString("base64url");
  await authRepository.createSession(user.id, crypto.createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000), marker, "127.0.0.1");
  return `hotel_session=${token}`;
}
async function raw(suffix: string, punchDate = date, hour = "09:00:00", test = false) {
  const result = await pool.query("INSERT INTO raw_attendance_punches(device_id,biometric_id,punch_time,raw_payload,source_event_key) VALUES(NULL,$1,$2::timestamptz,'{}',$3) RETURNING id", [bio, `${punchDate}T${hour}+05:30`, `${test ? "test" : marker}-${suffix}-${crypto.randomUUID()}`]);
  return Number(result.rows[0].id);
}
async function attendance(key: string, attendanceDate = date, rawId?: number, holidayId?: string, shift: string | null = shiftId) {
  await pool.query("INSERT INTO daily_attendance_records(attendance_key,attendance_date,employee_id,biometric_id,shift_id,holiday_id,raw_punch_count,status,first_raw_punch_id,last_raw_punch_id) VALUES($1,$2,$3,$4,$5,$6,$7,'PRESENT',$8,$8)", [key, attendanceDate, employeeId, bio, shift, holidayId ?? null, rawId ? 1 : 0, rawId ?? null]);
}
async function period(month: number) {
  return (await request(app).post("/payroll/periods").set("Cookie", admin).send({ year, month }).expect(201)).body;
}
async function lockPeriod(month: number) { const p = await period(month); await request(app).post(`/payroll/periods/${p.id}/lock`).set("Cookie", admin).send({}).expect(200); return p; }

describe("Safe record management", () => {
  beforeAll(async () => {
    admin = await session("ADMIN"); manager = await session("MANAGER");
    shiftId = (await request(app).post("/shifts").set("Cookie", admin).send({ name: `${marker}-shift`, start_time: "09:00", end_time: "18:00" }).expect(201)).body.id;
    employeeId = (await pool.query("INSERT INTO employees(biometric_id,name,joining_date,active) VALUES($1,$2,$3,true) RETURNING id", [bio, `${marker}-employee`, `${year}-01-01`])).rows[0].id;
    await pool.query("INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from) VALUES($1,$2,$3)", [employeeId, shiftId, `${year}-01-01`]);
  });
  afterAll(async () => {
    await pool.query("DELETE FROM attendance_exceptions WHERE employee_id=$1", [employeeId]);
    await pool.query("DELETE FROM daily_attendance_records WHERE attendance_key LIKE $1 OR employee_id=$2", [`${marker}%`, employeeId]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE source_event_key LIKE $1 OR biometric_id=$2", [`${marker}%`, bio]);
    await pool.query("DELETE FROM employee_payroll_records WHERE employee_id=$1", [employeeId]);
    await pool.query("DELETE FROM payroll_periods WHERE year=$1", [year]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id=$1 OR shift_id=$2", [employeeId, shiftId]);
    await pool.query("DELETE FROM employees WHERE id=$1", [employeeId]);
    await pool.query("DELETE FROM holidays WHERE name LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM shifts WHERE name LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM app_users WHERE email LIKE $1", [`${marker}%`]);
  });

  it("deletes attendance without deleting raw punches, rebuilds it, and blocks locked history", async () => {
    const first = await raw("attendance-first"); const second = await raw("attendance-second", date, "18:00:00");
    await request(app).post("/attendance/rebuild").set("Cookie", admin).send({ date }).expect(200);
    const record = (await pool.query("SELECT attendance_key FROM daily_attendance_records WHERE employee_id=$1 AND attendance_date=$2", [employeeId, date])).rows[0];
    await request(app).delete("/attendance/records").set("Cookie", admin).send({ ids: [record.attendance_key] }).expect(200);
    expect((await pool.query("SELECT id FROM raw_attendance_punches WHERE id=ANY($1::bigint[])", [[first, second]])).rowCount).toBe(2);
    await request(app).post("/attendance/rebuild").set("Cookie", admin).send({ date }).expect(200);
    expect((await pool.query("SELECT 1 FROM daily_attendance_records WHERE employee_id=$1 AND attendance_date=$2", [employeeId, date])).rowCount).toBe(1);
    const lockedDate = `${year}-02-15`; const lockedRaw = await raw("locked-attendance", lockedDate); await attendance(`${marker}-locked-attendance`, lockedDate, lockedRaw); await lockPeriod(2);
    await request(app).delete("/attendance/records").set("Cookie", admin).send({ ids: [`${marker}-locked-attendance`] }).expect(409);
  });

  it("resolves exceptions and only deletes safe/test exceptions", async () => {
    const safe = await raw("safe-exception"); const production = await raw("production-exception", date, "05:00:00");
    for (const [id, safeToDelete] of [[safe, true], [production, false]] as const) await pool.query("INSERT INTO attendance_exceptions(raw_punch_id,attendance_date,employee_id,biometric_id,shift_id,punch_time,exception_type,message,safe_to_delete) VALUES($1,$2,$3,$4,$5,$6::timestamptz,'OUT_OF_SHIFT','test',$7)", [id, date, employeeId, bio, shiftId, `${date}T05:00:00+05:30`, safeToDelete]);
    await request(app).patch("/attendance/exceptions/resolve").set("Cookie", admin).send({ ids: [safe] }).expect(200);
    expect((await pool.query("SELECT resolved_at FROM attendance_exceptions WHERE raw_punch_id=$1", [safe])).rows[0].resolved_at).toBeTruthy();
    await request(app).delete("/attendance/exceptions").set("Cookie", admin).send({ ids: [safe] }).expect(200);
    expect((await pool.query("SELECT 1 FROM attendance_exceptions WHERE raw_punch_id=$1", [safe])).rowCount).toBe(0);
    const blocked = await request(app).delete("/attendance/exceptions").set("Cookie", admin).send({ ids: [production] }).expect(200);
    expect(blocked.body.deleted).toBe(0); expect((await pool.query("SELECT 1 FROM attendance_exceptions WHERE raw_punch_id=$1", [production])).rowCount).toBe(1);
  });

  it("ignores punches, excludes them from rebuilds, reprocesses idempotently, clears test data, and blocks locked raw deletion", async () => {
    const ignored = await raw("ignored", date, "12:00:00");
    await request(app).patch("/devices/punches/ignore").set("Cookie", admin).send({ ids: [ignored], ignored: true }).expect(200);
    await request(app).post("/attendance/rebuild").set("Cookie", admin).send({ date }).expect(200);
    const rebuilt = (await pool.query("SELECT raw_punch_count FROM daily_attendance_records WHERE employee_id=$1 AND attendance_date=$2", [employeeId, date])).rows[0]; expect(Number(rebuilt.raw_punch_count)).toBe(3);
    const one = await request(app).post("/devices/punches/reprocess").set("Cookie", admin).send({ ids: [ignored] }).expect(200); const two = await request(app).post("/devices/punches/reprocess").set("Cookie", admin).send({ ids: [ignored] }).expect(200); expect(one.body).toMatchObject({ processed: 0, skipped: 1 }); expect(two.body).toMatchObject({ processed: 0, skipped: 1 });
    const testRaw = await raw("clear", `${year}-03-15`, "09:00:00", true); await request(app).post("/devices/punches/clear-date").set("Cookie", admin).send({ date: `${year}-03-15` }).expect(200); expect((await pool.query("SELECT 1 FROM raw_attendance_punches WHERE id=$1", [testRaw])).rowCount).toBe(0);
    const lockedDate = `${year}-04-15`; const lockedRaw = await raw("locked-raw", lockedDate); await attendance(`${marker}-locked-raw`, lockedDate, lockedRaw); await lockPeriod(4);
    await request(app).delete("/devices/punches").set("Cookie", admin).send({ ids: [lockedRaw] }).expect(409);
  });

  it("only bulk-deletes unused drafts and preserves generated, locked, and cancelled payroll history", async () => {
    const draft = await period(5); await request(app).delete("/payroll/periods/bulk-drafts").set("Cookie", admin).send({ ids: [draft.id] }).expect(200);
    const generated = await period(6); await request(app).post(`/payroll/periods/${generated.id}/generate`).set("Cookie", admin).send({}).expect(200); await request(app).delete("/payroll/periods/bulk-drafts").set("Cookie", admin).send({ ids: [generated.id] }).expect(409);
    const locked = await lockPeriod(7); await request(app).delete("/payroll/periods/bulk-drafts").set("Cookie", admin).send({ ids: [locked.id] }).expect(409);
    const cancelled = await period(8); await request(app).post(`/payroll/periods/${cancelled.id}/cancel`).set("Cookie", admin).send({}).expect(200); await request(app).delete("/payroll/periods/bulk-drafts").set("Cookie", admin).send({ ids: [cancelled.id] }).expect(409); expect((await request(app).get(`/payroll/periods/${cancelled.id}`).set("Cookie", admin).expect(200)).body.status).toBe("CANCELLED");
  });

  it("protects referenced holidays while allowing unused deletion and deactivation", async () => {
    const unused = (await request(app).post("/holidays").set("Cookie", admin).send({ holiday_date: `${year}-09-01`, name: `${marker}-unused-holiday` }).expect(201)).body;
    await request(app).delete(`/holidays/${unused.id}`).set("Cookie", admin).expect(204);
    const used = (await request(app).post("/holidays").set("Cookie", admin).send({ holiday_date: `${year}-09-02`, name: `${marker}-used-holiday` }).expect(201)).body;
    await attendance(`${marker}-holiday`, `${year}-09-02`, undefined, used.id, null); await request(app).delete(`/holidays/${used.id}`).set("Cookie", admin).expect(409); await request(app).patch(`/holidays/${used.id}/status`).set("Cookie", admin).send({ active: false }).expect(200);
  });

  it("protects assigned and historical shifts while allowing unused deletion and deactivation", async () => {
    const create = async (suffix: string) => (await request(app).post("/shifts").set("Cookie", admin).send({ name: `${marker}-${suffix}`, start_time: "09:00", end_time: "18:00" }).expect(201)).body.id;
    const unused = await create("unused-shift"); await request(app).delete("/shifts/bulk-unused").set("Cookie", admin).send({ ids: [unused] }).expect(200);
    const assigned = await create("assigned-shift"); await pool.query("INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from) VALUES($1,$2,$3)", [employeeId, assigned, `${year}-12-01`]); await request(app).delete("/shifts/bulk-unused").set("Cookie", admin).send({ ids: [assigned] }).expect(409);
    const historical = await create("historical-shift"); await attendance(`${marker}-shift-history`, `${year}-10-01`, undefined, undefined, historical); await request(app).delete("/shifts/bulk-unused").set("Cookie", admin).send({ ids: [historical] }).expect(409); await request(app).patch("/shifts/bulk-status").set("Cookie", admin).send({ ids: [historical], active: false }).expect(200);
  });

  it("enforces ADMIN-only destructive operations and blocks unauthenticated requests", async () => {
    const draft = await period(11); const testPunch = await raw("permission", `${year}-11-15`, "09:00:00", true);
    await request(app).delete("/payroll/periods/bulk-drafts").set("Cookie", manager).send({ ids: [draft.id] }).expect(403);
    await request(app).delete("/devices/punches").set("Cookie", manager).send({ ids: [testPunch] }).expect(403);
    await request(app).delete("/attendance/records").send({ ids: ["missing"] }).expect(401);
    await request(app).delete("/payroll/periods/bulk-drafts").set("Cookie", admin).send({ ids: [draft.id] }).expect(200);
  });
});
