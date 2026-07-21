import request from "supertest";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import crypto from "node:crypto";

const pool = getDatabasePool();
import { authRepository } from "../src/modules/auth/auth.repository.js";

const marker = `part11-${crypto.randomUUID()}`;
const adminEmail = `${marker}-admin@test.invalid`;
const managerEmail = `${marker}-manager@test.invalid`;
const adminUsername = `${marker}-admin`;
const managerUsername = `${marker}-manager`;
const shiftName = `${marker}-morning`;
const employeeName = `${marker}-employee`;
const biometricId = crypto.randomInt(20_000_000, 90_000_000);
let adminCookie: string;
let managerCookie: string;
let adminId: string;
let managerId: string;
let initialSummary = {
  totalEmployees: 0,
  activeEmployees: 0,
  inactiveEmployees: 0,
  activeShifts: 0,
  employeesWithoutCurrentShift: 0,
  presentToday: 0,
  currentlyCheckedIn: 0,
  missingPunchOut: 0,
  unmatchedPunches: 0,
};

describe("Dashboard & Shifts & Employees Integration", () => {
  beforeAll(async () => {
    // Create Admin
    const adminRes = await pool.query(
      `INSERT INTO app_users (email, username, password_hash, role, active) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [adminEmail, adminUsername, "hash", "ADMIN", true]
    );
    adminId = adminRes.rows[0].id;

    // Create Manager
    const managerRes = await pool.query(
      `INSERT INTO app_users (email, username, password_hash, role, active) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [managerEmail, managerUsername, "hash", "MANAGER", true]
    );
    managerId = managerRes.rows[0].id;

    // Create sessions
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    const adminToken = crypto.randomBytes(32).toString("base64url");
    const adminHash = crypto.createHash("sha256").update(adminToken).digest("hex");
    await authRepository.createSession(adminId, adminHash, expiresAt, "user-agent", "127.0.0.1");
    adminCookie = `hotel_session=${adminToken}; Path=/; HttpOnly`;

    const managerToken = crypto.randomBytes(32).toString("base64url");
    const managerHash = crypto.createHash("sha256").update(managerToken).digest("hex");
    await authRepository.createSession(managerId, managerHash, expiresAt, "user-agent", "127.0.0.1");
    managerCookie = `hotel_session=${managerToken}; Path=/; HttpOnly`;

    const response = await request(app).get("/dashboard/summary").set("Cookie", adminCookie).expect(200);
    initialSummary = response.body as typeof initialSummary;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id = $1", [employeeId || null]);
    await pool.query("DELETE FROM employees WHERE id = $1", [employeeId || null]);
    await pool.query("DELETE FROM shifts WHERE id = $1", [shiftId || null]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])", [[adminId, managerId].filter(Boolean)]);
    await pool.query("DELETE FROM app_users WHERE id = ANY($1::uuid[])", [[adminId, managerId].filter(Boolean)]);
    // Do not close pool here because other tests might still be running
  });

  it("should return the existing dashboard counts before adding fixtures", async () => {
    const res = await request(app).get("/dashboard/summary").set("Cookie", adminCookie).expect(200);
    expect(res.body).toEqual(initialSummary);
  });

  let shiftId: string;
  let employeeId: string;

  it("should allow ADMIN to create a shift", async () => {
    const res = await request(app)
      .post("/shifts")
      .set("Cookie", adminCookie)
      .send({
        name: shiftName,
        start_time: "08:00",
        end_time: "16:00",
        grace_minutes: 15,
        minimum_work_minutes: 240,
        is_overnight: false,
      })
      .expect(201);
    shiftId = res.body.id;
    expect(res.body.name).toBe(shiftName);
  });

  it("should reject duplicate case-insensitive shift name", async () => {
    await request(app)
      .post("/shifts")
      .set("Cookie", adminCookie)
      .send({
        name: shiftName.toUpperCase(),
        start_time: "08:00",
        end_time: "16:00",
      })
      .expect(409);
  });

  it("should reject MANAGER from creating a shift", async () => {
    await request(app)
      .post("/shifts")
      .set("Cookie", managerCookie)
      .send({
        name: "Evening Shift",
        start_time: "16:00",
        end_time: "00:00",
      })
      .expect(403);
  });

  it("should allow MANAGER to view shifts", async () => {
    const res = await request(app).get("/shifts").set("Cookie", managerCookie).expect(200);
    expect(res.body.some((shift: { id: string }) => shift.id === shiftId)).toBe(true);
  });

  it("should allow ADMIN to create an employee with initial shift", async () => {
    const res = await request(app)
      .post("/employees")
      .set("Cookie", adminCookie)
      .send({
        biometric_id: biometricId,
        name: employeeName,
        joining_date: "2026-01-01",
        initial_shift: {
          shift_id: shiftId,
          effective_from: "2026-01-01",
        }
      })
      .expect(201);
    
    employeeId = res.body.id;
    expect(String(res.body.biometric_id)).toBe(String(biometricId));
  });

  it("should reject duplicate biometric ID", async () => {
    await request(app)
      .post("/employees")
      .set("Cookie", adminCookie)
      .send({
        biometric_id: biometricId,
        name: `${marker}-duplicate`,
        joining_date: "2026-02-01",
      })
      .expect(409);
  });

  it("should allow MANAGER to view employees list", async () => {
    const res = await request(app).get(`/employees?search=${encodeURIComponent(marker)}`).set("Cookie", managerCookie).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].name).toBe(employeeName);
  });

  it("should show dashboard counts correctly", async () => {
    const res = await request(app).get("/dashboard/summary").set("Cookie", adminCookie).expect(200);
    expect(res.body).toEqual({
      totalEmployees: initialSummary.totalEmployees + 1,
      activeEmployees: initialSummary.activeEmployees + 1,
      inactiveEmployees: initialSummary.inactiveEmployees,
      activeShifts: initialSummary.activeShifts + 1,
      employeesWithoutCurrentShift: initialSummary.employeesWithoutCurrentShift,
      presentToday: initialSummary.presentToday,
      currentlyCheckedIn: initialSummary.currentlyCheckedIn,
      missingPunchOut: initialSummary.missingPunchOut,
      unmatchedPunches: initialSummary.unmatchedPunches,
    });
  });

  it("should close old shift assignment when a new one is added", async () => {
    // Assign a new shift effective 2026-02-01
    await request(app)
      .post(`/employees/${employeeId}/shift-assignments`)
      .set("Cookie", adminCookie)
      .send({
        shift_id: shiftId,
        effective_from: "2026-02-01"
      })
      .expect(201);

    const res = await request(app).get(`/employees/${employeeId}/shift-assignments`).set("Cookie", adminCookie).expect(200);
    expect(res.body.length).toBe(2);

    // Sort assignments by effective_from date
    const sorted = [...res.body].sort((a: { effective_from: string }, b: { effective_from: string }) => new Date(a.effective_from).getTime() - new Date(b.effective_from).getTime());
    
    const oldAssignment = sorted[0];
    const newAssignment = sorted[1];
    
    expect(oldAssignment).toBeDefined();
    // effective_to shouldn't be null for the old assignment
    expect(oldAssignment.effective_to).not.toBeNull();

    expect(newAssignment).toBeDefined();
    expect(newAssignment.effective_to).toBeNull();
  });

  it("should reject overlapping future shift assignments if one is already open", async () => {
    // Current open shift starts 2026-02-01. Trying to add one for 2026-01-15 should be rejected
    // because it would mean the 2026-02-01 assignment overlaps.
    await request(app)
      .post(`/employees/${employeeId}/shift-assignments`)
      .set("Cookie", adminCookie)
      .send({
        shift_id: shiftId,
        effective_from: "2026-01-15"
      })
      .expect(409);
  });

  it("should allow ADMIN to deactivate employee", async () => {
    await request(app)
      .patch(`/employees/${employeeId}/status`)
      .set("Cookie", adminCookie)
      .send({ active: false })
      .expect(200);

    const res = await request(app).get("/dashboard/summary").set("Cookie", adminCookie).expect(200);
    expect(res.body.activeEmployees).toBe(initialSummary.activeEmployees);
    expect(res.body.inactiveEmployees).toBe(initialSummary.inactiveEmployees + 1);
  });
});
