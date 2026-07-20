import request from "supertest";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import crypto from "node:crypto";

const pool = getDatabasePool();
import { authRepository } from "../src/modules/auth/auth.repository.js";

let adminCookie: string;
let managerCookie: string;
let adminId: string;
let managerId: string;

describe("Dashboard & Shifts & Employees Integration", () => {
  beforeAll(async () => {
    // Clean up before starting
    await pool.query("DELETE FROM employee_shift_assignments");
    await pool.query("DELETE FROM shifts");
    await pool.query("DELETE FROM employees");
    await pool.query("DELETE FROM auth_sessions");
    await pool.query("DELETE FROM app_users");

    // Create Admin
    const adminRes = await pool.query(
      `INSERT INTO app_users (email, password_hash, role, active) VALUES ($1, $2, $3, $4) RETURNING id`,
      ["admin@test.com", "hash", "ADMIN", true]
    );
    adminId = adminRes.rows[0].id;

    // Create Manager
    const managerRes = await pool.query(
      `INSERT INTO app_users (email, password_hash, role, active) VALUES ($1, $2, $3, $4) RETURNING id`,
      ["manager@test.com", "hash", "MANAGER", true]
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
  });

  afterAll(async () => {
    await pool.query("DELETE FROM employee_shift_assignments");
    await pool.query("DELETE FROM shifts");
    await pool.query("DELETE FROM employees");
    await pool.query("DELETE FROM auth_sessions");
    await pool.query("DELETE FROM app_users");
    // Do not close pool here because other tests might still be running
  });

  it("should return empty dashboard counts", async () => {
    const res = await request(app).get("/dashboard/summary").set("Cookie", adminCookie).expect(200);
    expect(res.body).toEqual({
      totalEmployees: 0,
      activeEmployees: 0,
      inactiveEmployees: 0,
      activeShifts: 0,
      employeesWithoutCurrentShift: 0,
    });
  });

  let shiftId: string;
  let employeeId: string;

  it("should allow ADMIN to create a shift", async () => {
    const res = await request(app)
      .post("/shifts")
      .set("Cookie", adminCookie)
      .send({
        name: "Morning Shift",
        start_time: "08:00",
        end_time: "16:00",
        grace_minutes: 15,
        minimum_work_minutes: 240,
        is_overnight: false,
      })
      .expect(201);
    shiftId = res.body.id;
    expect(res.body.name).toBe("Morning Shift");
  });

  it("should reject duplicate case-insensitive shift name", async () => {
    await request(app)
      .post("/shifts")
      .set("Cookie", adminCookie)
      .send({
        name: "morning shift",
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
    expect(res.body.length).toBe(1);
  });

  it("should allow ADMIN to create an employee with initial shift", async () => {
    const res = await request(app)
      .post("/employees")
      .set("Cookie", adminCookie)
      .send({
        biometric_id: 1001,
        name: "John Doe",
        joining_date: "2026-01-01",
        initial_shift: {
          shift_id: shiftId,
          effective_from: "2026-01-01",
        }
      })
      .expect(201);
    
    employeeId = res.body.id;
    expect(String(res.body.biometric_id)).toBe("1001");
  });

  it("should reject duplicate biometric ID", async () => {
    await request(app)
      .post("/employees")
      .set("Cookie", adminCookie)
      .send({
        biometric_id: 1001,
        name: "Jane Doe",
        joining_date: "2026-02-01",
      })
      .expect(409);
  });

  it("should allow MANAGER to view employees list", async () => {
    const res = await request(app).get("/employees?search=John").set("Cookie", managerCookie).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].name).toBe("John Doe");
  });

  it("should show dashboard counts correctly", async () => {
    const res = await request(app).get("/dashboard/summary").set("Cookie", adminCookie).expect(200);
    expect(res.body).toEqual({
      totalEmployees: 1,
      activeEmployees: 1,
      inactiveEmployees: 0,
      activeShifts: 1,
      employeesWithoutCurrentShift: 0,
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
    expect(res.body.activeEmployees).toBe(0);
    expect(res.body.inactiveEmployees).toBe(1);
  });
});
