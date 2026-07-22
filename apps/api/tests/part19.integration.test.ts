import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { rebuildAttendanceForBiometricDate } from "../src/modules/attendance/attendance.repository.js";
import { markStaleDevicesOffline } from "../src/modules/devices/device-status.service.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `part19-${crypto.randomUUID()}`;
const deviceCode = `${marker}-MB160`;
const biometricId = crypto.randomInt(810_000_000, 890_000_000);
const date = "2997-07-22";
let deviceId = "";
let employeeId = "";
let shiftId = "";
let adminCookie = "";
let managerCookie = "";

async function session(role: "ADMIN" | "MANAGER"): Promise<string> { const username=`${marker}-${role}`; const user=(await pool.query("INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test',$3,true) RETURNING id",[`${username}@test.invalid`,username,role])).rows[0]; const token=crypto.randomBytes(24).toString("base64url"); await authRepository.createSession(user.id,crypto.createHash("sha256").update(token).digest("hex"),new Date(Date.now()+3600000),"part19","127.0.0.1"); return `hotel_session=${token}`; }
async function employee(bio:number, day:string, shift=shiftId){const id=(await pool.query("INSERT INTO employees(biometric_id,name,joining_date,active) VALUES($1,$2,$3,true) RETURNING id",[bio,`${marker}-${bio}`,day])).rows[0].id;await pool.query("INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from) VALUES($1,$2,$3)",[id,shift,day]);return id as string;}

const cdata = (body = "", code = deviceCode) => request(app)
  .post(`/iclock/cdata?SN=${encodeURIComponent(code)}&table=ATTLOG`)
  .set("Content-Type", "text/plain")
  .send(body);

describe("Part 19 live ADMS integration", () => {
  beforeAll(async () => {
    deviceId = (await pool.query("INSERT INTO devices(device_code,name,model,active,status) VALUES($1,$2,'MB160',true,'OFFLINE') RETURNING id", [deviceCode, marker])).rows[0].id;
    shiftId = (await pool.query("INSERT INTO shifts(name,start_time,end_time,active) VALUES($1,'09:00','18:00',true) RETURNING id", [marker])).rows[0].id;
    employeeId = (await pool.query("INSERT INTO employees(biometric_id,name,joining_date,active) VALUES($1,$2,$3,true) RETURNING id", [biometricId, `${marker}-Ravi`, date])).rows[0].id;
    await pool.query("INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from) VALUES($1,$2,$3)", [employeeId, shiftId, date]);
    adminCookie=await session("ADMIN"); managerCookie=await session("MANAGER");
  });

  afterAll(async () => {
    delete process.env.ATTENDANCE_TEST_NOW;
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1) OR attendance_key LIKE $2", [`${marker}%`,`%${marker}%`]);
    await pool.query("DELETE FROM attendance_exceptions WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE device_id=$1", [deviceId]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM employees WHERE name LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM shifts WHERE name LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM devices WHERE id=$1", [deviceId]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM app_users WHERE username LIKE $1)", [`${marker}%`]); await pool.query("DELETE FROM app_users WHERE username LIKE $1", [`${marker}%`]);
  });

  it("accepts an unauthenticated known-device heartbeat and marks it online", async () => {
    await request(app).get(`/iclock/cdata?SN=${encodeURIComponent(deviceCode)}&options=all`).expect(200).expect("Content-Type", /text\/plain/);
    const row = (await pool.query("SELECT last_seen,last_ip::text,status,last_sync FROM devices WHERE id=$1", [deviceId])).rows[0];
    expect(row.last_seen).toBeTruthy(); expect(row.last_ip).toBeTruthy(); expect(row.last_sync).toBeTruthy(); expect(row.status).toBe("ONLINE");
  });

  it("marks a stale device offline without mutating it on status reads", async () => {
    await pool.query("UPDATE devices SET last_seen=now()-interval '10 minutes',status='ONLINE' WHERE id=$1", [deviceId]);
    await markStaleDevicesOffline();
    expect((await pool.query("SELECT status FROM devices WHERE id=$1", [deviceId])).rows[0].status).toBe("OFFLINE");
    await request(app).get(`/iclock/cdata?SN=${encodeURIComponent(deviceCode)}`).expect(200);
  });

  it("rejects unknown and inactive devices without auto-creating records", async () => {
    await cdata("1\t2997-07-22 09:00:00\t0\t1", "unknown-part19-device").expect(404, "ERROR");
    const inactive = (await pool.query("INSERT INTO devices(device_code,active,status) VALUES($1,false,'OFFLINE') RETURNING id", [`${marker}-inactive`])).rows[0].id;
    await cdata("1\t2997-07-22 09:00:00\t0\t1", `${marker}-inactive`).expect(403, "ERROR");
    expect((await pool.query("SELECT count(*)::int count FROM devices WHERE device_code='unknown-part19-device'")).rows[0].count).toBe(0);
    await pool.query("DELETE FROM devices WHERE id=$1", [inactive]);
  });

  it("stores multiple valid ATTLOG rows once and preserves IST device time", async () => {
    const body = `${biometricId}\t${date} 09:05:00\t0\t1\t0\n${biometricId}\t${date} 18:00:00\t1\t1\t0`;
    await cdata(body).expect(200, "OK: 2");
    await cdata(body).expect(200, "OK: 2");
    const rows = await pool.query("SELECT biometric_id,device_code,device_timestamp,source,processed FROM raw_attendance_punches WHERE device_id=$1 ORDER BY punch_time", [deviceId]);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({ biometric_id: String(biometricId), device_code: deviceCode, device_timestamp: `${date} 09:05:00`, source: "ADMS", processed: false });
  });

  it("processes a matched employee as present using earliest and latest punches", async () => {
    const row = (await pool.query("SELECT status,working_minutes,punch_in_at,punch_out_at FROM daily_attendance_records WHERE employee_id=$1 AND attendance_date=$2", [employeeId, date])).rows[0];
    expect(row).toMatchObject({ status: "PRESENT", working_minutes: 535 });
    expect(new Date(row.punch_in_at).toISOString()).toContain("03:35:00.000Z");
    expect(new Date(row.punch_out_at).toISOString()).toContain("12:30:00.000Z");
  });

  it("keeps unmatched biometric punches without creating employees", async () => {
    const unmatched = biometricId + 1;
    await cdata(`${unmatched}\t${date} 10:00:00\t0\t1`).expect(200, "OK: 1");
    expect((await pool.query("SELECT count(*)::int count FROM employees WHERE biometric_id=$1", [unmatched])).rows[0].count).toBe(0);
    expect((await pool.query("SELECT status FROM daily_attendance_records WHERE biometric_id=$1", [unmatched])).rows[0].status).toBe("UNMATCHED");
  });

  it("safely skips malformed rows while accepting valid records", async () => {
    const unmatched = biometricId + 2;
    await cdata(`invalid-line\n${unmatched}\t${date} 11:00:00\t0\t1\n${unmatched}\t2997-99-99 11:00:00\t0\t1`).expect(200, "OK: 1");
    expect((await pool.query("SELECT count(*)::int count FROM raw_attendance_punches WHERE device_id=$1 AND biometric_id=$2", [deviceId, unmatched])).rows[0].count).toBe(1);
  });

  it("uses currently-checked-in and missing-punch states deterministically", async () => {
    const currentBio = biometricId + 3;
    await pool.query("INSERT INTO employees(biometric_id,name,joining_date,active) VALUES($1,$2,$3,true)", [currentBio, `${marker}-current`, date]);
    const currentEmployee = (await pool.query("SELECT id FROM employees WHERE biometric_id=$1", [currentBio])).rows[0].id;
    await pool.query("INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from) VALUES($1,$2,$3)", [currentEmployee, shiftId, date]);
    process.env.ATTENDANCE_TEST_NOW = "2997-07-22T10:00:00+05:30";
    await cdata(`${currentBio}\t${date} 09:05:00\t0\t1`).expect(200);
    expect((await pool.query("SELECT status FROM daily_attendance_records WHERE employee_id=$1", [currentEmployee])).rows[0].status).toBe("CURRENTLY_CHECKED_IN");
    process.env.ATTENDANCE_TEST_NOW = "2997-07-22T19:00:00+05:30";
    await rebuildAttendanceForBiometricDate(String(currentBio), date);
    expect((await pool.query("SELECT status FROM daily_attendance_records WHERE employee_id=$1", [currentEmployee])).rows[0].status).toBe("MISSING_PUNCH");
    await pool.query("DELETE FROM daily_attendance_records WHERE employee_id=$1", [currentEmployee]);
    await pool.query("DELETE FROM raw_attendance_punches WHERE biometric_id=$1", [currentBio]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id=$1", [currentEmployee]);
    await pool.query("DELETE FROM employees WHERE id=$1", [currentEmployee]);
  });

  it("paginates raw punches deterministically with filters", async () => {
    const bio=biometricId+20; for(let i=0;i<6;i+=1) await cdata(`${bio}\t${date} ${String(10+i).padStart(2,"0")}:00:00\t0\t1`).expect(200);
    const one=await request(app).get(`/reports/raw-punches?deviceId=${deviceId}&biometricId=${bio}&limit=3&page=1`).set("Cookie",managerCookie).expect(200); const two=await request(app).get(`/reports/raw-punches?deviceId=${deviceId}&biometricId=${bio}&limit=3&page=2`).set("Cookie",managerCookie).expect(200);
    expect(one.body.pagination).toMatchObject({total:6,pages:2}); expect(new Set([...one.body.items,...two.body.items].map((row:{id:number})=>row.id)).size).toBe(6); expect(one.body.items[0].punch_timestamp_ist).toContain("15:00:00");
  });

  it("ignores a raw punch through the ADMIN API and removes it from attendance", async () => {
    const bio=biometricId+21; const id=await employee(bio,date); await cdata(`${bio}\t${date} 09:00:00\t0\t1\n${bio}\t${date} 18:00:00\t1\t1`); const punch=Number((await pool.query("SELECT id FROM raw_attendance_punches WHERE biometric_id=$1 ORDER BY punch_time DESC LIMIT 1",[bio])).rows[0].id);
    await request(app).patch("/devices/punches/ignore").set("Cookie",adminCookie).send({ids:[punch],ignored:true}).expect(200); expect((await pool.query("SELECT ignored FROM raw_attendance_punches WHERE id=$1",[punch])).rows[0].ignored).toBe(true); expect((await pool.query("SELECT status FROM daily_attendance_records WHERE employee_id=$1",[id])).rows[0].status).toBe("MISSING_PUNCH");
  });

  it("reprocesses selected punches without creating duplicates", async () => {
    const bio=biometricId+22; const id=await employee(bio,date); await cdata(`${bio}\t${date} 09:00:00\t0\t1\n${bio}\t${date} 18:00:00\t1\t1`); const ids=(await pool.query("SELECT id FROM raw_attendance_punches WHERE biometric_id=$1 ORDER BY id",[bio])).rows.map((row:{id:string})=>Number(row.id)); await request(app).post("/devices/punches/reprocess").set("Cookie",adminCookie).send({ids}).expect(200); expect((await pool.query("SELECT count(*)::int count FROM raw_attendance_punches WHERE biometric_id=$1",[bio])).rows[0].count).toBe(2); expect((await pool.query("SELECT status FROM daily_attendance_records WHERE employee_id=$1",[id])).rows[0].status).toBe("PRESENT"); expect((await pool.query("SELECT bool_and(processed) done FROM raw_attendance_punches WHERE id=ANY($1::bigint[])",[ids])).rows[0].done).toBe(true);
  });

  it("rebuilds a late historical checkout from missing punch to present", async () => {
    const day="2996-01-10",bio=biometricId+23,id=await employee(bio,day); await cdata(`${bio}\t${day} 09:00:00\t0\t1`); expect((await pool.query("SELECT status FROM daily_attendance_records WHERE employee_id=$1",[id])).rows[0].status).toBe("MISSING_PUNCH"); await cdata(`${bio}\t${day} 18:00:00\t1\t1`); expect((await pool.query("SELECT status,working_minutes FROM daily_attendance_records WHERE employee_id=$1",[id])).rows[0]).toMatchObject({status:"PRESENT",working_minutes:540});
  });

  it("assigns overnight punches to the start date with correct worked minutes", async () => {
    const day="2997-08-01",bio=biometricId+24,overnight=(await pool.query("INSERT INTO shifts(name,start_time,end_time,is_overnight,active) VALUES($1,'22:00','06:00',true,true) RETURNING id",[`${marker}-overnight`])).rows[0].id,id=await employee(bio,day,overnight); await cdata(`${bio}\t${day} 22:05:00\t0\t1\n${bio}\t2997-08-02 06:00:00\t1\t1`); expect((await pool.query("SELECT attendance_date::text,status,working_minutes FROM daily_attendance_records WHERE employee_id=$1",[id])).rows[0]).toMatchObject({attendance_date:day,status:"PRESENT",working_minutes:475});
  });

  it("handles one overnight punch before and after the missing-punch deadline", async () => {
    const day="2997-08-03",bio=biometricId+25,overnight=(await pool.query("INSERT INTO shifts(name,start_time,end_time,is_overnight,active) VALUES($1,'22:00','06:00',true,true) RETURNING id",[`${marker}-overnight-one`])).rows[0].id,id=await employee(bio,day,overnight); process.env.ATTENDANCE_TEST_NOW="2997-08-04T01:00:00+05:30"; await cdata(`${bio}\t${day} 22:05:00\t0\t1`); expect((await pool.query("SELECT status FROM daily_attendance_records WHERE employee_id=$1",[id])).rows[0].status).toBe("CURRENTLY_CHECKED_IN"); process.env.ATTENDANCE_TEST_NOW="2997-08-04T07:00:00+05:30"; await rebuildAttendanceForBiometricDate(String(bio),day); expect((await pool.query("SELECT status FROM daily_attendance_records WHERE employee_id=$1",[id])).rows[0].status).toBe("MISSING_PUNCH"); delete process.env.ATTENDANCE_TEST_NOW;
  });

  it("keeps management endpoints authenticated while ADMS stays sessionless", async () => { await request(app).get("/devices").expect(401); await request(app).get("/devices").set("Cookie",managerCookie).expect(200); await request(app).post("/devices").set("Cookie",managerCookie).send({device_code:`${marker}-forbidden`}).expect(403); await request(app).get(`/iclock/getrequest?SN=${encodeURIComponent(deviceCode)}`).expect(200,"OK"); });

  it("does not mutate device fields or punches on a business status read", async () => { const before=(await pool.query("SELECT last_seen,last_sync,last_raw_punch_time,updated_at FROM devices WHERE id=$1",[deviceId])).rows[0]; const count=(await pool.query("SELECT count(*)::int count FROM raw_attendance_punches WHERE device_id=$1",[deviceId])).rows[0].count; await request(app).get(`/devices/${deviceId}`).set("Cookie",managerCookie).expect(200); expect((await pool.query("SELECT last_seen,last_sync,last_raw_punch_time,updated_at FROM devices WHERE id=$1",[deviceId])).rows[0]).toEqual(before); expect((await pool.query("SELECT count(*)::int count FROM raw_attendance_punches WHERE device_id=$1",[deviceId])).rows[0].count).toBe(count); });

  it("keeps dashboard device status and unmatched counters consistent", async () => { await request(app).get(`/iclock/cdata?SN=${encodeURIComponent(deviceCode)}`).expect(200); const endpoint=await request(app).get(`/devices/${deviceId}`).set("Cookie",managerCookie).expect(200); expect(endpoint.body.status).toBe("ONLINE"); const unmatched=(await pool.query("SELECT count(*)::int count FROM daily_attendance_records WHERE status='UNMATCHED' AND biometric_id BETWEEN $1 AND $2",[biometricId,biometricId+30])).rows[0].count; expect(unmatched).toBeGreaterThanOrEqual(1); });

  it("is concurrency-safe for duplicate ADMS submissions", async () => { const bio=biometricId+26,body=`${bio}\t2997-09-01 09:00:00\t0\t1`; const responses=await Promise.all([cdata(body),cdata(body)]); responses.forEach(response=>expect(response.status).toBe(200)); expect((await pool.query("SELECT count(*)::int count FROM raw_attendance_punches WHERE biometric_id=$1",[bio])).rows[0].count).toBe(1); });

  it("returns accepted row count for partial malformed payloads", async () => { const bio=biometricId+27; const response=await cdata(`bad\n${bio}\t${date} 12:00:00\t0\t1\nbad-again`).expect(200); expect(response.text).toBe("OK: 1"); expect((await pool.query("SELECT count(*)::int count FROM raw_attendance_punches WHERE biometric_id=$1",[bio])).rows[0].count).toBe(1); });

  it("resolves a registered serial number case-insensitively without creating a device", async () => { const serial=`${marker}-SERIAL`; const id=(await pool.query("INSERT INTO devices(device_code,serial_number,active,status) VALUES($1,$2,true,'OFFLINE') RETURNING id",[`${marker}-serial-device`,serial])).rows[0].id; await request(app).get(`/iclock/cdata?SN=${encodeURIComponent(serial.toLowerCase())}`).expect(200,"OK: 0"); expect((await pool.query("SELECT status FROM devices WHERE id=$1",[id])).rows[0].status).toBe("ONLINE"); await pool.query("DELETE FROM devices WHERE id=$1",[id]); });
});
