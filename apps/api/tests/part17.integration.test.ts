/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";
import { getDatabasePool } from "../src/infrastructure/database/database.js";

const pool = getDatabasePool();
const marker = `part17-${crypto.randomUUID()}`;
const testYear = 3000 + crypto.randomInt(1, 5000);
const emptyPayrollYear = testYear + 1;
const periodIds: string[] = [];
let biometric = crypto.randomInt(100000000, 900000000);
let shiftId = "";
let admin = "";
let manager = "";

const date = (month: number, day: number) => `${testYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

async function login(role: "ADMIN" | "MANAGER") {
  const user = (await pool.query(
    "INSERT INTO app_users(email,username,password_hash,role,active) VALUES($1,$2,'test',$3,true) RETURNING id",
    [`${marker}-${role}@test.invalid`, `${marker}-${role}`, role],
  )).rows[0];
  const token = crypto.randomBytes(32).toString("base64url");
  await authRepository.createSession(user.id, crypto.createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3600000), "part17", "127.0.0.1");
  return `hotel_session=${token}`;
}

async function employee() {
  const employeeBiometricId = ++biometric;
  const e = (await pool.query(
    "INSERT INTO employees(biometric_id,name,joining_date,active) VALUES($1,$2,$3,true) RETURNING id",
    [employeeBiometricId, `${marker}-employee-${employeeBiometricId}`, date(1, 1)],
  )).rows[0];
  await pool.query(
    "INSERT INTO employee_shift_assignments(employee_id,shift_id,effective_from,effective_to) VALUES($1,$2,$3,$4)",
    [e.id, shiftId, date(1, 1), date(12, 31)],
  );
  // Deliberately create no attendance: payroll eligibility must not depend on it.
  await pool.query(
    "INSERT INTO employee_salary_history(employee_id,salary_type,monthly_salary,effective_from,effective_to,active) VALUES($1,'MONTHLY',31000,$2,$3,true)",
    [e.id, date(1, 1), date(12, 31)],
  );
  return e;
}

async function createPeriod(year: number, month: number) {
  const response = await request(app)
    .post("/payroll/periods")
    .set("Cookie", manager)
    .send({ year, month })
    .expect(201);
  periodIds.push(response.body.id);
  return response.body;
}

async function makePeriod(month: number) {
  const e = await employee();
  const p = await createPeriod(testYear, month);
  await request(app).post(`/payroll/periods/${p.id}/generate`).set("Cookie", manager).send({}).expect(200);
  const record = (await request(app).get(`/payroll/periods/${p.id}/records`).set("Cookie", manager)).body.find((x: any) => x.employee_id === e.id);
  expect(record).toBeDefined();
  return { e, p, record };
}

describe("Part 17 payroll approval, payment and salary slips", () => {
  beforeAll(async () => {
    shiftId = (await pool.query(
      "INSERT INTO shifts(name,start_time,end_time,grace_minutes,minimum_work_minutes,active) VALUES($1,'09:00','18:00',0,480,true) RETURNING id",
      [`${marker}-shift`],
    )).rows[0].id;
    admin = await login("ADMIN");
    manager = await login("MANAGER");
  });

  afterAll(async () => {
    const employees = `${marker}-employee-%`;
    await pool.query("UPDATE module_settings SET payroll_enabled=true,updated_by=NULL WHERE module_name='payroll'");
    await pool.query("DELETE FROM payroll_payment_audit WHERE payroll_payment_id IN (SELECT id FROM payroll_payments WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1))", [employees]);
    await pool.query("DELETE FROM payroll_slips WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [employees]);
    await pool.query("DELETE FROM payroll_payments WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [employees]);
    await pool.query("DELETE FROM employee_advance_transactions WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [employees]);
    await pool.query("DELETE FROM payroll_deductions WHERE payroll_record_id IN (SELECT id FROM employee_payroll_records WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1))", [employees]);
    await pool.query("DELETE FROM employee_payroll_records WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [employees]);
    await pool.query("UPDATE payroll_periods SET generated_by=NULL,approved_by=NULL,paid_by=NULL,locked_by=NULL WHERE id = ANY($1::uuid[])", [periodIds]);
    await pool.query("DELETE FROM payroll_periods WHERE id = ANY($1::uuid[])", [periodIds]);
    await pool.query("DELETE FROM employee_shift_assignments WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [employees]);
    await pool.query("DELETE FROM employee_salary_history WHERE employee_id IN (SELECT id FROM employees WHERE name LIKE $1)", [employees]);
    await pool.query("DELETE FROM employees WHERE name LIKE $1", [employees]);
    await pool.query("DELETE FROM shifts WHERE id=$1", [shiftId]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE $1)", [`${marker}%`]);
    await pool.query("DELETE FROM app_users WHERE email LIKE $1", [`${marker}%`]);
  });

  it("approves generated payroll idempotently and freezes record edits", async () => {
    const { p, record } = await makePeriod(1);
    await request(app).post(`/payroll/periods/${p.id}/approve`).set("Cookie", manager).send({}).expect(403);
    await request(app).post(`/payroll/periods/${p.id}/approve`).send({}).expect(401);
    const approved = await request(app).post(`/payroll/periods/${p.id}/approve`).set("Cookie", admin).send({ notes: "checked" }).expect(200);
    expect(approved.body).toMatchObject({ status: "APPROVED", approval_notes: "checked" });
    await request(app).post(`/payroll/periods/${p.id}/approve`).set("Cookie", admin).send({ notes: "different" }).expect(200);
    await request(app).patch(`/payroll/records/${record.id}`).set("Cookie", manager).send({ advance_recovery: 0 }).expect(400);
    await request(app).post(`/payroll/periods/${p.id}/recalculate`).set("Cookie", manager).send({}).expect(400);
  });

  it("rejects draft, cancelled, and empty payroll approval", async () => {
    const draft = await createPeriod(testYear, 2);
    await request(app).post(`/payroll/periods/${draft.id}/approve`).set("Cookie", admin).send({}).expect(409);
    await request(app).post(`/payroll/periods/${draft.id}/generate`).set("Cookie", manager).send({}).expect(200);
    await request(app).post(`/payroll/periods/${draft.id}/cancel`).set("Cookie", admin).send({ cancellation_reason: "test" }).expect(200);
    await request(app).post(`/payroll/periods/${draft.id}/approve`).set("Cookie", admin).send({}).expect(409);
    const empty = await createPeriod(emptyPayrollYear, 3);
    await request(app).post(`/payroll/periods/${empty.id}/generate`).set("Cookie", manager).send({}).expect(200);
    await request(app).post(`/payroll/periods/${empty.id}/approve`).set("Cookie", admin).send({}).expect(400);
  });

  it("pays once, preserves payment history, and supports one reversal", async () => {
    const { p, record } = await makePeriod(4);
    const generatedRecords = (await request(app).get(`/payroll/periods/${p.id}/records`).set("Cookie", manager)).body;
    await request(app).post(`/payroll/periods/${p.id}/pay`).set("Cookie", admin).send({ paymentMethod: "UPI", paymentDate: date(4, 30) }).expect(409);
    await request(app).post(`/payroll/periods/${p.id}/approve`).set("Cookie", admin).send({}).expect(200);
    await request(app).post(`/payroll/periods/${p.id}/pay`).set("Cookie", manager).send({ paymentMethod: "UPI", paymentDate: date(4, 30) }).expect(403);
    await request(app).post(`/payroll/periods/${p.id}/pay`).set("Cookie", admin).send({ paymentMethod: "UPI", paymentDate: date(4, 30), paymentReference: "test-ref" }).expect(200);
    await request(app).post(`/payroll/periods/${p.id}/pay`).set("Cookie", admin).send({ paymentMethod: "UPI", paymentDate: date(4, 30) }).expect(200);
    const history = (await request(app).get(`/payroll/periods/${p.id}/payments`).set("Cookie", manager).expect(200)).body;
    expect(history).toHaveLength(generatedRecords.length);
    const selected = history.find((payment: any) => payment.employee_id === record.employee_id);
    expect(selected).toBeDefined();
    expect(Number(selected.amount)).toBe(Number(record.net_pay));
    const recordHistory = (await request(app).get(`/payroll/records/${record.id}/payments`).set("Cookie", manager).expect(200)).body;
    expect(recordHistory).toHaveLength(1);
    await request(app).post(`/payroll/payments/${selected.id}/reverse`).set("Cookie", manager).send({ reason: "test" }).expect(403);
    await request(app).post(`/payroll/payments/${selected.id}/reverse`).set("Cookie", admin).send({ reason: "duplicate payment" }).expect(200);
    await request(app).post(`/payroll/payments/${selected.id}/reverse`).set("Cookie", admin).send({ reason: "again" }).expect(409);
    expect((await request(app).get(`/payroll/periods/${p.id}/payments`).set("Cookie", manager)).body.find((payment: any) => payment.id === selected.id)).toMatchObject({ status: "REVERSED", reversal_reason: "duplicate payment" });
  });

  it("generates stable frozen HTML/PDF salary slips and keeps them readable when disabled", async () => {
    const { e, p, record } = await makePeriod(5);
    await request(app).post(`/payroll/periods/${p.id}/approve`).set("Cookie", admin).send({}).expect(200);
    const one = await request(app).get(`/payroll/records/${record.id}/slip`).set("Cookie", manager).expect(200);
    await pool.query("UPDATE employee_salary_history SET monthly_salary=999999 WHERE employee_id=$1", [e.id]);
    const two = await request(app).get(`/payroll/records/${record.id}/slip`).set("Cookie", manager).expect(200);
    expect(two.body.slip_number).toBe(one.body.slip_number);
    expect(Number(two.body.base_salary)).toBe(Number(one.body.base_salary));
    await request(app).get(`/payroll/records/${record.id}/slip/pdf`).set("Cookie", manager).expect("Content-Type", /application\/pdf/).expect(200);
    await request(app).patch("/settings/modules/payroll").set("Cookie", admin).send({ enabled: false }).expect(200);
    await request(app).get(`/payroll/records/${record.id}/slip`).set("Cookie", manager).expect(200);
    await request(app).post(`/payroll/periods/${p.id}/pay`).set("Cookie", admin).send({ paymentMethod: "CASH", paymentDate: date(5, 31) }).expect(409);
  });
});
