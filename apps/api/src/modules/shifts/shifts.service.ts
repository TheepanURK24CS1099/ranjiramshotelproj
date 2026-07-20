import * as shiftsRepository from "./shifts.repository.js";
import type { Shift } from "./shifts.repository.js";

export async function getShifts(activeOnly?: boolean): Promise<Shift[]> {
  return await shiftsRepository.getShifts(activeOnly);
}

export async function getShiftById(id: string): Promise<Shift | null> {
  return await shiftsRepository.getShiftById(id);
}

export async function createShift(shiftData: Omit<Shift, "id" | "created_at" | "updated_at">): Promise<Shift> {
  const existing = await shiftsRepository.getShiftByName(shiftData.name);
  if (existing) {
    throw new Error("Conflict: Shift with this name already exists");
  }
  return await shiftsRepository.createShift(shiftData);
}

export async function updateShift(id: string, shiftData: Partial<Omit<Shift, "id" | "created_at" | "updated_at">>): Promise<Shift | null> {
  if (shiftData.name) {
    const existing = await shiftsRepository.getShiftByName(shiftData.name);
    if (existing && existing.id !== id) {
      throw new Error("Conflict: Shift with this name already exists");
    }
  }
  return await shiftsRepository.updateShift(id, shiftData);
}

export async function updateShiftStatus(id: string, active: boolean): Promise<Shift | null> {
  return await shiftsRepository.updateShiftStatus(id, active);
}
