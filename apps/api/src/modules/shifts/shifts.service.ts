import * as shiftsRepository from "./shifts.repository.js";
import type { Shift, CreateShiftInput } from "./shifts.repository.js";

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

export function validateShiftSessions(sessions: shiftsRepository.ShiftSessionInput[]): void {
  if (sessions.length < 1 || sessions.length > 3) {
    throw new Error("Validation: A shift must have between 1 and 3 sessions");
  }

  const sessionNumbers = new Set<number>();
  for (const s of sessions) {
    if (sessionNumbers.has(s.session_number)) {
      throw new Error(`Validation: Duplicate session_number ${s.session_number}`);
    }
    sessionNumbers.add(s.session_number);
  }

  const windows = sessions.map((s) => {
    const startMin = parseTimeToMinutes(s.start_time);
    let endMin = parseTimeToMinutes(s.end_time);
    const crosses = s.crosses_midnight || endMin <= startMin;
    if (crosses) {
      endMin += 1440;
    }
    const winStart = startMin - (s.checkin_before_minutes ?? 0);
    const winEnd = endMin + (s.checkout_after_minutes ?? 60);
    return { session_number: s.session_number, winStart, winEnd };
  });

  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const w1 = windows[i]!;
      const w2 = windows[j]!;
      if (Math.max(w1.winStart, w2.winStart) < Math.min(w1.winEnd, w2.winEnd)) {
        throw new Error(`Validation: Session ${w1.session_number} and Session ${w2.session_number} punch windows overlap`);
      }
    }
  }
}

export async function getShifts(activeOnly?: boolean): Promise<Shift[]> {
  return await shiftsRepository.getShifts(activeOnly);
}

export async function getShiftById(id: string): Promise<Shift | null> {
  return await shiftsRepository.getShiftById(id);
}

export async function createShift(shiftData: CreateShiftInput): Promise<Shift> {
  const existing = await shiftsRepository.getShiftByName(shiftData.name);
  if (existing) {
    throw new Error("Conflict: Shift with this name already exists");
  }
  if (shiftData.sessions && shiftData.sessions.length > 0) {
    validateShiftSessions(shiftData.sessions);
  }
  return await shiftsRepository.createShift(shiftData);
}

export async function updateShift(id: string, shiftData: Partial<CreateShiftInput>): Promise<Shift | null> {
  if (shiftData.name) {
    const existing = await shiftsRepository.getShiftByName(shiftData.name);
    if (existing && existing.id !== id) {
      throw new Error("Conflict: Shift with this name already exists");
    }
  }
  if (shiftData.sessions && shiftData.sessions.length > 0) {
    validateShiftSessions(shiftData.sessions);
  }
  return await shiftsRepository.updateShift(id, shiftData);
}

export async function updateShiftStatus(id: string, active: boolean): Promise<Shift | null> {
  return await shiftsRepository.updateShiftStatus(id, active);
}

export async function deleteShiftIfUnused(id: string): Promise<boolean> {
  return await shiftsRepository.deleteShiftIfUnused(id);
}

export async function bulkShiftStatus(ids: string[], active: boolean) {
  return { updated: await shiftsRepository.bulkStatus(ids, active) };
}

export async function deleteUnusedShifts(ids: string[]) {
  return { deleted: await shiftsRepository.deleteUnused(ids) };
}
