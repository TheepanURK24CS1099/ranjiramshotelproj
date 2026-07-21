import { getDatabasePool } from "../../infrastructure/database/database.js";

const pool = getDatabasePool();

export interface AdvanceTransaction {
  id: string;
  employee_id: string;
  transaction_type: "OPENING_ADVANCE" | "ADVANCE_GIVEN" | "REPAYMENT" | "ADJUSTMENT";
  amount: string;
  transaction_date: string;
  notes: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  entered_by: string | null;
}

export async function getEmployee(employeeId: string): Promise<{ active: boolean } | null> {
  return (await pool.query<{ active: boolean }>("SELECT active FROM employees WHERE id=$1", [employeeId])).rows[0] ?? null;
}

export async function listAdvances(employeeId: string): Promise<AdvanceTransaction[]> {
  return (await pool.query<AdvanceTransaction>(
    `SELECT a.id,a.employee_id,a.transaction_type,a.amount,a.transaction_date::text,a.notes,a.created_by,a.created_at,a.updated_at,
            COALESCE(u.username,u.email) AS entered_by
     FROM employee_advance_transactions a JOIN app_users u ON u.id=a.created_by
     WHERE a.employee_id=$1 ORDER BY a.transaction_date DESC,a.created_at DESC`,
    [employeeId],
  )).rows;
}

export async function getBalance(employeeId: string): Promise<string> {
  const result = await pool.query<{ balance: string }>(
    `SELECT COALESCE(SUM(CASE
       WHEN transaction_type IN ('OPENING_ADVANCE','ADVANCE_GIVEN','ADJUSTMENT') THEN amount
       WHEN transaction_type='REPAYMENT' THEN -amount
     END),0)::numeric(12,2)::text AS balance
     FROM employee_advance_transactions WHERE employee_id=$1`,
    [employeeId],
  );
  return result.rows[0]!.balance;
}

export async function openingAdvanceExists(employeeId: string): Promise<boolean> {
  return (await pool.query("SELECT 1 FROM employee_advance_transactions WHERE employee_id=$1 AND transaction_type='OPENING_ADVANCE'", [employeeId])).rowCount === 1;
}

export async function createAdvance(input: Omit<AdvanceTransaction, "id" | "created_at" | "updated_at" | "entered_by">): Promise<AdvanceTransaction> {
  const result = await pool.query<AdvanceTransaction>(
    `INSERT INTO employee_advance_transactions(employee_id,transaction_type,amount,transaction_date,notes,created_by)
     VALUES($1,$2,$3,$4::date,$5,$6)
     RETURNING id,employee_id,transaction_type,amount,transaction_date::text,notes,created_by,created_at,updated_at,NULL::text AS entered_by`,
    [input.employee_id, input.transaction_type, input.amount, input.transaction_date, input.notes, input.created_by],
  );
  return result.rows[0]!;
}

export async function updateAdvance(employeeId: string, transactionId: string, input: { transaction_date?: string | undefined; notes?: string | null | undefined }): Promise<AdvanceTransaction | null> {
  const result = await pool.query<AdvanceTransaction>(
    `UPDATE employee_advance_transactions SET
       transaction_date=CASE WHEN $3 THEN $4::date ELSE transaction_date END,
       notes=CASE WHEN $5 THEN $6 ELSE notes END
     WHERE id=$1 AND employee_id=$2
     RETURNING id,employee_id,transaction_type,amount,transaction_date::text,notes,created_by,created_at,updated_at,NULL::text AS entered_by`,
    [transactionId, employeeId, input.transaction_date !== undefined, input.transaction_date ?? null, input.notes !== undefined, input.notes ?? null],
  );
  return result.rows[0] ?? null;
}
