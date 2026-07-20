import crypto from "node:crypto";
import request from "supertest";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";
import { calculateDeviceStatus,markStaleDevicesOffline } from "../src/modules/devices/device-status.service.js";

const pool=getDatabasePool();
const marker=`part12-${crypto.randomUUID()}`;
let adminCookie:string,managerCookie:string,deviceId:string;

async function session(role:"ADMIN"|"MANAGER"){
 const email=`${marker}-${role.toLowerCase()}@test.invalid`;
 const user=(await pool.query("INSERT INTO app_users(email,password_hash,role,active) VALUES($1,'test-only',$2,true) RETURNING id",[email,role])).rows[0];
 const token=crypto.randomBytes(32).toString("base64url"),hash=crypto.createHash("sha256").update(token).digest("hex");
 await authRepository.createSession(user.id,hash,new Date(Date.now()+3600000),"part12-test","127.0.0.1");
 return `hotel_session=${token}`;
}

describe("Part 12 devices and ADMS",()=>{
 beforeAll(async()=>{adminCookie=await session("ADMIN");managerCookie=await session("MANAGER")});
 afterAll(async()=>{
  await pool.query("DELETE FROM raw_attendance_punches WHERE device_id IN (SELECT id FROM devices WHERE device_code LIKE $1)",[`${marker}%`]);
  await pool.query("DELETE FROM devices WHERE device_code LIKE $1",[`${marker}%`]);
  await pool.query("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE $1)",[`${marker}%`]);
  await pool.query("DELETE FROM app_users WHERE email LIKE $1",[`${marker}%`]);
 });
 it("validates creation and enforces ADMIN writes",async()=>{
  await request(app).post("/devices").set("Cookie",adminCookie).send({device_code:""}).expect(400);
  await request(app).post("/devices").set("Cookie",managerCookie).send({device_code:`${marker}-manager`}).expect(403);
  const res=await request(app).post("/devices").set("Cookie",adminCookie).send({device_code:`${marker}-MB160-01`,name:"Lobby",model:"MB160",serial_number:`${marker}-SERIAL`}).expect(201);
  deviceId=res.body.id;expect(res.body.status).toBe("OFFLINE");
 });
 it("rejects duplicate device codes case-insensitively",async()=>{await request(app).post("/devices").set("Cookie",adminCookie).send({device_code:`${marker}-mb160-01`}).expect(409)});
 it("allows MANAGER read-only access",async()=>{await request(app).get("/devices").set("Cookie",managerCookie).expect(200);await request(app).patch(`/devices/${deviceId}`).set("Cookie",managerCookie).send({name:"No"}).expect(403)});
 it("updates heartbeat, IP and ONLINE state",async()=>{const res=await request(app).get(`/iclock/getrequest?SN=${encodeURIComponent(`${marker}-SERIAL`)}`).expect(200);expect(res.text).toBe("OK");const row=(await pool.query("SELECT * FROM devices WHERE id=$1",[deviceId])).rows[0];expect(row.last_seen).not.toBeNull();expect(row.last_ip).not.toBeNull();expect(row.status).toBe("ONLINE")});
 it("stores raw punches without mixing employee and device identities",async()=>{
  const body="3\t2026-07-20 09:15:00\t0\t1\t0";
  await request(app).post(`/iclock/cdata?SN=${encodeURIComponent(`${marker}-MB160-01`)}`).set("Content-Type","text/plain").send(body).expect(200,"OK: 1");
  const row=(await pool.query("SELECT * FROM raw_attendance_punches WHERE device_id=$1",[deviceId])).rows[0];expect(String(row.biometric_id)).toBe("3");expect(row.device_id).toBe(deviceId);expect(row.raw_payload.payload).toBe(body);
 });
 it("keeps unknown biometric IDs and safely ignores duplicates",async()=>{const body="999999\t2026-07-20 10:00:00\t1\t2";for(let i=0;i<2;i++)await request(app).post(`/iclock/cdata?SN=${encodeURIComponent(`${marker}-SERIAL`)}`).set("Content-Type","application/x-www-form-urlencoded").send(`ATTLOG=${encodeURIComponent(body)}`).expect(200,"OK: 1");const count=await pool.query("SELECT count(*) FROM raw_attendance_punches WHERE device_id=$1 AND biometric_id=999999",[deviceId]);expect(count.rows[0].count).toBe("1")});
 it("does not crash on malformed payload",async()=>{await request(app).post(`/iclock/cdata?SN=${encodeURIComponent(`${marker}-SERIAL`)}`).set("Content-Type","text/plain").send("not a punch").expect(200,"OK: 0")});
 it("rejects unknown devices safely",async()=>{await request(app).post("/iclock/cdata?SN=does-not-exist").set("Content-Type","text/plain").send("3\t2026-07-20 09:00:00").expect(404,"ERROR")});
 it("returns recent raw punches",async()=>{const res=await request(app).get(`/devices/${deviceId}/recent-punches`).set("Cookie",managerCookie).expect(200);expect(res.body.length).toBe(2);expect(res.body.some((p:{biometric_id:string})=>String(p.biometric_id)==="3")).toBe(true)});
 it("marks stale active devices OFFLINE and inactive devices never ONLINE",async()=>{await pool.query("UPDATE devices SET last_seen=now()-interval '10 minutes',status='ONLINE' WHERE id=$1",[deviceId]);await markStaleDevicesOffline();expect((await pool.query("SELECT status FROM devices WHERE id=$1",[deviceId])).rows[0].status).toBe("OFFLINE");expect(calculateDeviceStatus(false,new Date())).toBe("OFFLINE");await request(app).patch(`/devices/${deviceId}/deactivate`).set("Cookie",adminCookie).send({}).expect(200);await request(app).get(`/iclock/getrequest?SN=${encodeURIComponent(`${marker}-SERIAL`)}`).expect(403,"ERROR")});
});
