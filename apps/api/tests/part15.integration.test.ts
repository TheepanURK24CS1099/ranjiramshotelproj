import crypto from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const pool = getDatabasePool();
const marker = `part15-${crypto.randomUUID()}`;
let biometricId = crypto.randomInt(100_000_000, 900_000_000);
let adminCookie = "";
let managerCookie = "";

function nextBiometricId(): number { biometricId += 1; return biometricId; }

async function session(role: "ADMIN" | "MANAGER"): Promise<string> {
  const user = (await pool.query(
    "INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test-only',$3,true) RETURNING id",
    [`${marker}-${role.toLowerCase()}@test.invalid`, `${marker}-${role.toLowerCase()}`, role],
  )).rows[0];
  const token = crypto.randomBytes(32).toString("base64url");
  await authRepository.createSession(user.id, crypto.createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3_600_000), "part15-test", "127.0.0.1");
  return `hotel_session=${token}`;
}

async function employee(suffix: string, active = true): Promise<string> {
  return (await pool.query(
    "INSERT INTO employees(biometric_id,name,joining_date,active) VALUES($1,$2,'1998-01-01',$3) RETURNING id",
    [nextBiometricId(), `${marker}-${suffix}`, active],
  )).rows[0].id as string;
}

function salary(type: "MONTHLY" | "DAILY" | "HOURLY", effectiveFrom: string, amount = 1000) {
  const payload: Record<string, unknown> = { salary_type: type, effective_from: effectiveFrom };
  if (type === "MONTHLY") payload.monthly_salary = amount;
  if (type === "DAILY") payload.daily_rate = amount;
  if (type === "HOURLY") payload.hourly_rate = amount;
  return payload;
}

describe("Part 15 salary and advance management", () => {
  beforeAll(async () => { adminCookie = await session("ADMIN"); managerCookie = await session("MANAGER"); });

  afterAll(async () => {
    await pool.query("DELETE FROM employee_advance_transactions WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM employee_salary_history WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM employees WHERE name LIKE $1", [`${marker}%`]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM app_users WHERE email LIKE $1", [`${marker}%`]);
  });

  it("creates monthly, daily, and hourly salary configurations", async () => {
    for (const type of ["MONTHLY", "DAILY", "HOURLY"] as const) {
      const id = await employee(`salary-${type}`);
      const response = await request(app).post(`/employees/${id}/salaries`).set("Cookie", managerCookie).send(salary(type, "1998-01-01", type === "MONTHLY" ? 18000 : type === "DAILY" ? 750 : 100)).expect(201);
      expect(response.body.salary_type).toBe(type);
      expect(Number(response.body.monthly_salary ?? response.body.daily_rate ?? response.body.hourly_rate)).toBeGreaterThan(0);
    }
  });

  it("rejects invalid salary amounts and active date overlaps", async () => {
    const id = await employee("salary-invalid");
    await request(app).post(`/employees/${id}/salaries`).set("Cookie", managerCookie).send({ salary_type: "MONTHLY", monthly_salary: 0, effective_from: "1998-01-01" }).expect(400);
    await request(app).post(`/employees/${id}/salaries`).set("Cookie", managerCookie).send(salary("DAILY", "1998-01-01", -1)).expect(400);
    await request(app).post(`/employees/${id}/salaries`).set("Cookie", managerCookie).send(salary("MONTHLY", "1998-01-01", 1000)).expect(201);
    await request(app).post(`/employees/${id}/salaries`).set("Cookie", managerCookie).send(salary("MONTHLY", "1998-01-01", 1200)).expect(409);
  });

  it("closes the prior salary period, preserves history, and supports future current-date lookup", async () => {
    const id = await employee("salary-history");
    const first = await request(app).post(`/employees/${id}/salaries`).set("Cookie", managerCookie).send({ ...salary("MONTHLY", "1998-01-01", 10000), notes: "Initial rate" }).expect(201);
    const second = await request(app).post(`/employees/${id}/salaries`).set("Cookie", managerCookie).send(salary("MONTHLY", "1998-02-01", 12000)).expect(201);
    const history = await request(app).get(`/employees/${id}/salaries`).set("Cookie", managerCookie).expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body.find((row: { id: string }) => row.id === first.body.id)).toMatchObject({ effective_to: "1998-01-31", notes: "Initial rate" });
    expect(history.body.find((row: { id: string }) => row.id === second.body.id)).toMatchObject({ effective_from: "1998-02-01" });
    const before = await request(app).get(`/employees/${id}/salaries/current?date=1998-01-15`).set("Cookie", managerCookie).expect(200);
    const after = await request(app).get(`/employees/${id}/salaries/current?date=1998-02-15`).set("Cookie", managerCookie).expect(200);
    expect(before.body.id).toBe(first.body.id);
    expect(after.body.id).toBe(second.body.id);
    await request(app).delete(`/employees/${id}/salaries/${first.body.id}`).set("Cookie", managerCookie).expect(404);
  });

  it("deactivates salary history and rejects reactivation that would overlap", async () => {
    const id = await employee("salary-status");
    const first = await request(app).post(`/employees/${id}/salaries`).set("Cookie", managerCookie).send(salary("MONTHLY", "1998-01-01", 1000)).expect(201);
    await request(app).patch(`/employees/${id}/salaries/${first.body.id}/status`).set("Cookie", managerCookie).send({ active: false }).expect(200);
    await request(app).post(`/employees/${id}/salaries`).set("Cookie", managerCookie).send(salary("MONTHLY", "1998-01-01", 1200)).expect(201);
    await request(app).patch(`/employees/${id}/salaries/${first.body.id}/status`).set("Cookie", managerCookie).send({ active: true }).expect(409);
  });

  it("allows optional opening advance during employee creation and records it as a transaction", async () => {
    const noOpening = await request(app).post("/employees").set("Cookie", adminCookie).send({ biometric_id: nextBiometricId(), name: `${marker}-no-opening`, joining_date: "1998-01-01" }).expect(201);
    const noOpeningAdvances = await request(app).get(`/employees/${noOpening.body.id}/advances`).set("Cookie", managerCookie).expect(200);
    expect(noOpeningAdvances.body.transactions).toHaveLength(0);

    const withOpening = await request(app).post("/employees").set("Cookie", adminCookie).send({
      biometric_id: nextBiometricId(), name: `${marker}-with-opening`, joining_date: "1998-01-01",
      initial_salary: salary("MONTHLY", "1998-01-01", 15000),
      opening_advance: { amount: 500, transaction_date: "1998-01-01", notes: "Opening" },
    }).expect(201);
    const advances = await request(app).get(`/employees/${withOpening.body.id}/advances`).set("Cookie", managerCookie).expect(200);
    expect(advances.body).toMatchObject({ pending_balance: "500.00" });
    expect(advances.body.transactions[0]).toMatchObject({ transaction_type: "OPENING_ADVANCE", amount: "500.00", notes: "Opening" });
  });

  it("prevents a duplicate opening advance", async () => {
    const id = await employee("duplicate-opening");
    const opening = { transaction_type: "OPENING_ADVANCE", amount: 100, transaction_date: "1998-01-01" };
    await request(app).post(`/employees/${id}/advances`).set("Cookie", managerCookie).send(opening).expect(201);
    await request(app).post(`/employees/${id}/advances`).set("Cookie", managerCookie).send(opening).expect(409);
  });

  it("calculates advance ledger balances, rejects over-repayment, and handles signed adjustments", async () => {
    const id = await employee("advance-balance");
    await request(app).post(`/employees/${id}/advances`).set("Cookie", managerCookie).send({ transaction_type: "ADVANCE_GIVEN", amount: 1000, transaction_date: "1998-01-01" }).expect(201);
    await request(app).post(`/employees/${id}/advances`).set("Cookie", managerCookie).send({ transaction_type: "REPAYMENT", amount: 250, transaction_date: "1998-01-02" }).expect(201);
    await request(app).post(`/employees/${id}/advances`).set("Cookie", managerCookie).send({ transaction_type: "REPAYMENT", amount: 800, transaction_date: "1998-01-03" }).expect(400);
    await request(app).post(`/employees/${id}/advances`).set("Cookie", managerCookie).send({ transaction_type: "ADJUSTMENT", amount: -50, transaction_date: "1998-01-03" }).expect(201);
    const balance = await request(app).get(`/employees/${id}/advances/balance`).set("Cookie", managerCookie).expect(200);
    expect(balance.body.pending_balance).toBe("700.00");
  });

  it("keeps transaction history when correcting notes", async () => {
    const id = await employee("advance-history");
    const created = await request(app).post(`/employees/${id}/advances`).set("Cookie", managerCookie).send({ transaction_type: "ADVANCE_GIVEN", amount: 100, transaction_date: "1998-01-01", notes: "Original" }).expect(201);
    await request(app).patch(`/employees/${id}/advances/${created.body.id}`).set("Cookie", managerCookie).send({ notes: "Corrected note" }).expect(200);
    const history = await request(app).get(`/employees/${id}/advances`).set("Cookie", managerCookie).expect(200);
    expect(history.body.transactions).toHaveLength(1);
    expect(history.body.transactions[0]).toMatchObject({ id: created.body.id, amount: "100.00", notes: "Corrected note" });
  });

  it("blocks advance writes for inactive employees and unauthenticated writes", async () => {
    const inactive = await employee("inactive-advance", false);
    await request(app).post(`/employees/${inactive}/advances`).set("Cookie", managerCookie).send({ transaction_type: "ADVANCE_GIVEN", amount: 100, transaction_date: "1998-01-01" }).expect(400);
    const active = await employee("unauthorized");
    await request(app).post(`/employees/${active}/salaries`).send(salary("MONTHLY", "1998-01-01", 1000)).expect(401);
    await request(app).post(`/employees/${active}/advances`).send({ transaction_type: "ADVANCE_GIVEN", amount: 100, transaction_date: "1998-01-01" }).expect(401);
  });

  it("blocks employee permanent deletion when salary or advance history exists", async () => {
    const salaryEmployee = await employee("delete-salary");
    await request(app).post(`/employees/${salaryEmployee}/salaries`).set("Cookie", managerCookie).send(salary("MONTHLY", "1998-01-01", 1000)).expect(201);
    const salaryDelete = await request(app).delete(`/employees/${salaryEmployee}`).set("Cookie", adminCookie).expect(409);
    expect(salaryDelete.body.message).toBe("Cannot delete this employee because historical records exist. Deactivate the employee instead.");

    const advanceEmployee = await employee("delete-advance");
    await request(app).post(`/employees/${advanceEmployee}/advances`).set("Cookie", managerCookie).send({ transaction_type: "ADVANCE_GIVEN", amount: 100, transaction_date: "1998-01-01" }).expect(201);
    const advanceDelete = await request(app).delete(`/employees/${advanceEmployee}`).set("Cookie", adminCookie).expect(409);
    expect(advanceDelete.body.message).toBe("Cannot delete this employee because historical records exist. Deactivate the employee instead.");
  });
});
