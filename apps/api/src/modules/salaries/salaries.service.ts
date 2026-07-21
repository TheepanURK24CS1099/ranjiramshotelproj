import * as repository from "./salaries.repository.js";
import type { CreateSalaryInput, SalaryRecord } from "./salaries.repository.js";

function currentIstDate(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export async function assertEmployeeExists(employeeId: string): Promise<void> {
  if (!await repository.employeeExists(employeeId)) throw new Error("Not Found: Employee not found");
}

export async function listSalaries(employeeId: string): Promise<SalaryRecord[]> {
  await assertEmployeeExists(employeeId);
  return repository.listSalaries(employeeId);
}

export async function getCurrentSalary(employeeId: string, date?: string): Promise<SalaryRecord | null> {
  await assertEmployeeExists(employeeId);
  return repository.getCurrentSalary(employeeId, date ?? currentIstDate());
}

export async function createSalary(employeeId: string, input: CreateSalaryInput): Promise<SalaryRecord> {
  await assertEmployeeExists(employeeId);
  return repository.createSalary(employeeId, input);
}

export async function updateSalary(employeeId: string, salaryId: string, input: { effective_to?: string | null | undefined; notes?: string | null | undefined }): Promise<SalaryRecord | null> {
  await assertEmployeeExists(employeeId);
  return repository.updateSalary(employeeId, salaryId, input);
}

export async function updateSalaryStatus(employeeId: string, salaryId: string, active: boolean): Promise<SalaryRecord | null> {
  await assertEmployeeExists(employeeId);
  return repository.updateSalaryStatus(employeeId, salaryId, active);
}
