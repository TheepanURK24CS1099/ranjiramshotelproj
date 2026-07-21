import * as repository from "./advances.repository.js";
import type { AdvanceTransaction } from "./advances.repository.js";

export async function assertActiveEmployee(employeeId: string): Promise<void> {
  const employee = await repository.getEmployee(employeeId);
  if (!employee) throw new Error("Not Found: Employee not found");
  if (!employee.active) throw new Error("Validation: Inactive employees cannot receive advance transactions");
}

export async function listAdvances(employeeId: string): Promise<{ transactions: AdvanceTransaction[]; pending_balance: string }> {
  if (!await repository.getEmployee(employeeId)) throw new Error("Not Found: Employee not found");
  const [transactions, pending_balance] = await Promise.all([repository.listAdvances(employeeId), repository.getBalance(employeeId)]);
  return { transactions, pending_balance };
}

export async function getBalance(employeeId: string): Promise<{ pending_balance: string }> {
  if (!await repository.getEmployee(employeeId)) throw new Error("Not Found: Employee not found");
  return { pending_balance: await repository.getBalance(employeeId) };
}

export async function createAdvance(employeeId: string, createdBy: string, input: { transaction_type: AdvanceTransaction["transaction_type"]; amount: number; transaction_date: string; notes?: string | null | undefined }): Promise<AdvanceTransaction> {
  await assertActiveEmployee(employeeId);
  if (input.transaction_type === "OPENING_ADVANCE" && await repository.openingAdvanceExists(employeeId)) throw new Error("Conflict: An opening advance already exists for this employee");
  if (input.transaction_type === "REPAYMENT" && input.amount > Number(await repository.getBalance(employeeId))) throw new Error("Validation: Repayment cannot be greater than the pending advance balance");
  return repository.createAdvance({ employee_id: employeeId, created_by: createdBy, transaction_type: input.transaction_type, amount: input.amount.toFixed(2), transaction_date: input.transaction_date, notes: input.notes ?? null });
}

export async function updateAdvance(employeeId: string, transactionId: string, input: { transaction_date?: string | undefined; notes?: string | null | undefined }): Promise<AdvanceTransaction | null> {
  if (!await repository.getEmployee(employeeId)) throw new Error("Not Found: Employee not found");
  return repository.updateAdvance(employeeId, transactionId, input);
}
