import { getDatabasePool } from "../infrastructure/database/database.js";

const pool = getDatabasePool();
const marker = "%part18-%";
if (process.env.CONFIRM_PART18_CLEANUP !== "yes") throw new Error("Preview only. Re-run with CONFIRM_PART18_CLEANUP=yes.");
if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_PART18_CLEANUP !== "yes") throw new Error("Refusing production cleanup without ALLOW_PRODUCTION_PART18_CLEANUP=yes.");
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const employees = await client.query<{ id: string }>("SELECT id FROM employees WHERE name ILIKE $1", [marker]);
  const ids = employees.rows.map((row) => row.id);
  const run = async (sql: string, params: unknown[] = []) => console.log(sql.match(/DELETE FROM (\w+)/u)?.[1], (await client.query(sql, params)).rowCount ?? 0);
  if (ids.length) {
    await run("DELETE FROM attendance_exceptions WHERE employee_id=ANY($1::uuid[])", [ids]);
    await run("DELETE FROM employee_advance_transactions WHERE employee_id=ANY($1::uuid[])", [ids]);
    await run("DELETE FROM payroll_payments WHERE employee_id=ANY($1::uuid[])", [ids]);
    await run("DELETE FROM payroll_deductions WHERE payroll_record_id IN (SELECT id FROM employee_payroll_records WHERE employee_id=ANY($1::uuid[]))", [ids]);
    await run("DELETE FROM employee_payroll_records WHERE employee_id=ANY($1::uuid[])", [ids]);
    await run("DELETE FROM daily_attendance_records WHERE employee_id=ANY($1::uuid[]) OR attendance_key ILIKE $2", [ids, marker]);
    await run("DELETE FROM employee_shift_assignments WHERE employee_id=ANY($1::uuid[])", [ids]);
    await run("DELETE FROM employee_salary_history WHERE employee_id=ANY($1::uuid[])", [ids]);
    await run("DELETE FROM employees WHERE id=ANY($1::uuid[])", [ids]);
  }
  await run("DELETE FROM raw_attendance_punches WHERE source_event_key ILIKE $1", [marker]);
  await run("DELETE FROM devices WHERE device_code ILIKE $1 OR name ILIKE $1", [marker]);
  await run("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM app_users WHERE username ILIKE $1 OR email ILIKE $1)", [marker]);
  await run("DELETE FROM app_users WHERE username ILIKE $1 OR email ILIKE $1", [marker]);
  await client.query("COMMIT");
} catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); await pool.end(); }
