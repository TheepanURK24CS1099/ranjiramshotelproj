import * as repository from "./attendance.repository.js";
import type { AttendanceDashboardSummary, AttendanceException, AttendanceFilters, AttendanceRecord, AttendanceStatus } from "./attendance.repository.js";

const IST_OFFSET_MS = 330 * 60_000;

function currentIstDate(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function getAttendance(filters: AttendanceFilters): Promise<AttendanceRecord[]> {
  return await repository.listAttendance(filters);
}

export async function getAttendanceExceptions(date: string): Promise<AttendanceException[]> {
  return await repository.listAttendanceExceptions(date);
}

export async function getAttendanceSummary(date?: string): Promise<AttendanceDashboardSummary> {
  const summaryDate = date ?? currentIstDate();
  return await repository.getAttendanceSummary(summaryDate);
}

export async function rebuildAttendance(date: string): Promise<void> {
  await repository.rebuildAttendanceForDate(date);
}

export type { AttendanceStatus };
