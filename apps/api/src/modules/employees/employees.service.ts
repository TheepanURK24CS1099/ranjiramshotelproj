import * as employeesRepository from "./employees.repository.js";
import type { Employee, EmployeesListOptions, ShiftAssignment } from "./employees.repository.js";

export async function getEmployees(options: EmployeesListOptions): Promise<{ data: Employee[]; total: number }> {
  return await employeesRepository.getEmployees(options);
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  return await employeesRepository.getEmployeeById(id);
}

export async function createEmployee(
  employeeData: Omit<Employee, "id" | "created_at" | "updated_at">,
  initialShift?: { shift_id: string; effective_from: string },
  initialSalary?: { salary_type: "MONTHLY" | "DAILY" | "HOURLY"; monthly_salary?: number | undefined; daily_rate?: number | undefined; hourly_rate?: number | undefined; effective_from: string; notes?: string | null | undefined },
  openingAdvance?: { amount: number; transaction_date: string; notes?: string | null | undefined; created_by: string },
): Promise<Employee> {
  const existing = await employeesRepository.getEmployeeByBiometricId(employeeData.biometric_id);
  if (existing) {
    throw new Error("Conflict: Employee with this biometric ID already exists");
  }
  return await employeesRepository.createEmployee(employeeData, initialShift, initialSalary, openingAdvance);
}

export async function updateEmployee(id: string, employeeData: Partial<Omit<Employee, "id" | "created_at" | "updated_at">>): Promise<Employee | null> {
  if (employeeData.biometric_id) {
    const existing = await employeesRepository.getEmployeeByBiometricId(employeeData.biometric_id);
    if (existing && existing.id !== id) {
      throw new Error("Conflict: Employee with this biometric ID already exists");
    }
  }
  return await employeesRepository.updateEmployee(id, employeeData);
}

export async function updateEmployeeStatus(id: string, active: boolean): Promise<Employee | null> {
  return await employeesRepository.updateEmployeeStatus(id, active);
}
export async function deleteEmployeeIfUnused(id: string): Promise<boolean> { return await employeesRepository.deleteEmployeeIfUnused(id); }

export async function getEmployeeShiftAssignments(employeeId: string): Promise<ShiftAssignment[]> {
  return await employeesRepository.getEmployeeShiftAssignments(employeeId);
}

export async function assignShift(employeeId: string, shiftId: string, effectiveFrom: string): Promise<ShiftAssignment> {
  // Check if employee exists
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    throw new Error("Not Found: Employee does not exist");
  }

  return await employeesRepository.assignShift(employeeId, shiftId, effectiveFrom);
}
