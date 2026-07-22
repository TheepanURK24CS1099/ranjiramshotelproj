import { getDatabasePool } from "../../infrastructure/database/database.js";

const pool = getDatabasePool();
const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MISSING_PUNCH_BUFFER_MINUTES = 15;
function attendanceNow(): Date { const value = process.env.ATTENDANCE_TEST_NOW; return value ? new Date(value) : new Date(); }

export type AttendanceStatus = "PRESENT" | "LATE" | "EARLY_EXIT" | "LATE_AND_EARLY_EXIT" | "HALF_DAY" | "ABSENT" | "MISSING_PUNCH" | "CURRENTLY_CHECKED_IN" | "PENDING" | "CHECK_IN_MISSING" | "WEEKLY_OFF" | "HOLIDAY" | "NO_SHIFT" | "UNMATCHED";

export interface AttendanceRecord {
  attendance_key: string;
  attendance_date: string;
  biometric_id: number;
  employee_id: string | null;
  employee_name: string | null;
  employee_code: string;
  shift_id: string | null;
  shift_name: string | null;
  punch_in_at: Date | null;
  punch_out_at: Date | null;
  working_minutes: number;
  late_minutes: number;
  early_exit_minutes: number;
  note: string | null;
  raw_punch_count: number;
  status: AttendanceStatus;
  first_raw_punch_id: number | null;
  last_raw_punch_id: number | null;
  unmatched_raw_punch_id: number | null;
  holiday_id: string | null;
}

interface RawPunchRow {
  id: number;
  biometric_id: number | null;
  punch_time: Date;
  employee_id: string | null;
  employee_name: string | null;
}

interface ShiftAssignmentRow {
  shift_id: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  grace_minutes: number;
  minimum_work_minutes: number;
  early_exit_tolerance_minutes: number;
  checkin_before_minutes: number;
  checkout_after_minutes: number;
  weekly_off_days: number[];
}

export interface AttendanceFilters {
  date: string;
  employeeId?: string | undefined;
  shiftId?: string | undefined;
  status?: AttendanceStatus | undefined;
}

export interface AttendanceDashboardSummary {
  presentToday: number;
  currentlyCheckedIn: number;
  missingPunchOut: number;
  unmatchedPunches: number;
}

export interface AttendanceException {
  raw_punch_id: number;
  attendance_date: string;
  employee_id: string;
  employee_name: string;
  biometric_id: number;
  shift_id: string;
  shift_name: string;
  punch_time: Date;
  exception_type: "OUT_OF_SHIFT";
  message: string;
}

type AttendanceUpsertRecord = Omit<AttendanceRecord, "employee_name" | "employee_code" | "shift_name" | "late_minutes" | "early_exit_minutes" | "note" | "holiday_id"> & Partial<Pick<AttendanceRecord, "late_minutes" | "early_exit_minutes" | "note" | "holiday_id">>;

function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error("Invalid date format");
  }
  return value;
}

function parseDateParts(date: string): { year: number; month: number; day: number } {
  const match = assertDate(date).match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) {
    throw new Error("Invalid date format");
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function addDays(date: string, days: number): string {
  const { year, month, day } = parseDateParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

function toIstDateKey(value: Date): string {
  return new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function parseTimeParts(timeValue: string): { hours: number; minutes: number; seconds: number } {
  const match = timeValue.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/u);
  if (!match) {
    throw new Error(`Invalid shift time: ${timeValue}`);
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    seconds: Number(match[3] ?? "0"),
  };
}

function toUtcFromIstDateTime(date: string, timeValue: string): Date {
  const { year, month, day } = parseDateParts(date);
  const { hours, minutes, seconds } = parseTimeParts(timeValue);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - IST_OFFSET_MS);
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

function attendanceKeyForEmployee(employeeId: string, date: string): string {
  return `attendance:${employeeId}:${date}`;
}

function attendanceKeyForUnmatched(rawPunchId: number): string {
  return `unmatched:${rawPunchId}`;
}

function isOvernightShift(startTime: string | null, endTime: string | null, isOvernight: boolean | null): boolean {
  if (isOvernight) {
    return true;
  }

  if (!startTime || !endTime) {
    return false;
  }

  return parseTimeParts(endTime).hours < parseTimeParts(startTime).hours || endTime <= startTime;
}

function attendanceWindowEnd(shiftEnd: Date, overnight: boolean, checkoutAfterMinutes: number): Date {
  if (overnight) {
    return shiftEnd;
  }

  return new Date(shiftEnd.getTime() + checkoutAfterMinutes * 60_000);
}

function attendanceStatusForPunches(first: RawPunchRow, last: RawPunchRow, shiftStart: Date, shiftEnd: Date, shift: ShiftAssignmentRow): { status: AttendanceStatus; lateMinutes: number; earlyExitMinutes: number; note: string | null } {
  if (first.id === last.id) { const now=attendanceNow(); const deadline=new Date(shiftEnd.getTime()+MISSING_PUNCH_BUFFER_MINUTES*60_000); const lateMinutes=Math.max(0,minutesBetween(new Date(shiftStart.getTime()+shift.grace_minutes*60_000),first.punch_time)); return now<deadline ? { status: "CURRENTLY_CHECKED_IN", lateMinutes, earlyExitMinutes: 0, note: lateMinutes ? `Late by ${lateMinutes} minutes; awaiting punch out` : "Awaiting punch out" } : { status: "MISSING_PUNCH", lateMinutes, earlyExitMinutes: 0, note: "Missing punch out" }; }
  // Existing shifts with no configured attendance rules retain the validated Part 13 PRESENT behavior.
  if (shift.grace_minutes === 0 && shift.minimum_work_minutes === 0 && shift.early_exit_tolerance_minutes === 0) {
    return { status: "PRESENT", lateMinutes: 0, earlyExitMinutes: 0, note: null };
  }
  const lateMinutes = Math.max(0, minutesBetween(new Date(shiftStart.getTime() + shift.grace_minutes * 60_000), first.punch_time));
  const earlyExitMinutes = Math.max(0, minutesBetween(last.punch_time, new Date(shiftEnd.getTime() - shift.early_exit_tolerance_minutes * 60_000)));
  const worked = minutesBetween(first.punch_time, last.punch_time);
  if (shift.minimum_work_minutes > 0 && worked < shift.minimum_work_minutes) return { status: "HALF_DAY", lateMinutes, earlyExitMinutes, note: "Below minimum working minutes" };
  if (lateMinutes && earlyExitMinutes) return { status: "LATE_AND_EARLY_EXIT", lateMinutes, earlyExitMinutes, note: null };
  if (lateMinutes) return { status: "LATE", lateMinutes, earlyExitMinutes, note: null };
  if (earlyExitMinutes) return { status: "EARLY_EXIT", lateMinutes, earlyExitMinutes, note: null };
  return { status: "PRESENT", lateMinutes: 0, earlyExitMinutes: 0, note: null };
}

function sortPunches(punches: RawPunchRow[]): RawPunchRow[] {
  return [...punches].sort((left, right) => {
    const timeDelta = left.punch_time.getTime() - right.punch_time.getTime();
    if (timeDelta !== 0) {
      return timeDelta;
    }

    return left.id - right.id;
  });
}

async function upsertAttendanceRecord(record: AttendanceUpsertRecord): Promise<void> {
  await pool.query(
    `INSERT INTO daily_attendance_records (
      attendance_key,
      attendance_date,
      employee_id,
      biometric_id,
      shift_id,
      punch_in_at,
      punch_out_at,
      working_minutes,
      raw_punch_count,
      late_minutes,
      early_exit_minutes,
      note,
      status,
      first_raw_punch_id,
      last_raw_punch_id,
      unmatched_raw_punch_id
      ,holiday_id
    ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (attendance_key) DO UPDATE SET
      attendance_date = EXCLUDED.attendance_date,
      employee_id = EXCLUDED.employee_id,
      biometric_id = EXCLUDED.biometric_id,
      shift_id = EXCLUDED.shift_id,
      punch_in_at = EXCLUDED.punch_in_at,
      punch_out_at = EXCLUDED.punch_out_at,
      working_minutes = EXCLUDED.working_minutes,
      raw_punch_count = EXCLUDED.raw_punch_count,
      late_minutes = EXCLUDED.late_minutes,
      early_exit_minutes = EXCLUDED.early_exit_minutes,
      note = EXCLUDED.note,
      holiday_id = EXCLUDED.holiday_id,
      status = EXCLUDED.status,
      first_raw_punch_id = EXCLUDED.first_raw_punch_id,
      last_raw_punch_id = EXCLUDED.last_raw_punch_id,
      unmatched_raw_punch_id = EXCLUDED.unmatched_raw_punch_id`,
    [
      record.attendance_key,
      record.attendance_date,
      record.employee_id,
      record.biometric_id,
      record.shift_id,
      record.punch_in_at,
      record.punch_out_at,
      record.working_minutes,
      record.raw_punch_count,
      record.late_minutes ?? 0,
      record.early_exit_minutes ?? 0,
      record.note ?? null,
      record.status,
      record.first_raw_punch_id,
      record.last_raw_punch_id,
      record.unmatched_raw_punch_id,
      record.holiday_id ?? null,
    ],
  );
}

async function getRawPunchesForDate(date: string): Promise<RawPunchRow[]> {
  const result = await pool.query<RawPunchRow>(
    `SELECT
      p.id,
      p.biometric_id,
      p.punch_time,
      e.id AS employee_id,
      e.name AS employee_name
     FROM raw_attendance_punches p
     LEFT JOIN employees e ON e.biometric_id = p.biometric_id
     WHERE coalesce(p.ignored,false)=false AND (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND ($1::date + INTERVAL '1 day')::date
     ORDER BY p.punch_time ASC, p.id ASC`,
    [assertDate(date)],
  );

  return result.rows;
}

async function getRawPunchesForBiometricDate(biometricId: string, date: string): Promise<RawPunchRow[]> {
  const result = await pool.query<RawPunchRow>(
    `SELECT
      p.id,
      p.biometric_id,
      p.punch_time,
      e.id AS employee_id,
      e.name AS employee_name
     FROM raw_attendance_punches p
     LEFT JOIN employees e ON e.biometric_id = p.biometric_id
     WHERE p.biometric_id = $1::bigint AND coalesce(p.ignored,false)=false
       AND (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND ($2::date + INTERVAL '1 day')::date
     ORDER BY p.punch_time ASC, p.id ASC`,
    [biometricId, assertDate(date)],
  );

  return result.rows;
}

async function getShiftAssignmentForDate(employeeId: string, date: string): Promise<ShiftAssignmentRow | null> {
  const result = await pool.query<ShiftAssignmentRow>(
    `SELECT
      esa.shift_id,
      s.name AS shift_name,
      s.start_time,
      s.end_time,
      s.is_overnight, s.grace_minutes, s.minimum_work_minutes, s.early_exit_tolerance_minutes, s.checkin_before_minutes, s.checkout_after_minutes, s.weekly_off_days
     FROM employee_shift_assignments esa
     JOIN shifts s ON s.id = esa.shift_id
     WHERE esa.employee_id = $1
       AND esa.effective_from <= $2::date
       AND (esa.effective_to IS NULL OR esa.effective_to >= $2::date)
     ORDER BY esa.effective_from DESC
     LIMIT 1`,
    [employeeId, date],
  );

  return result.rows[0] ?? null;
}

async function deleteAttendanceExceptionsForRawPunchIds(rawPunchIds: number[]): Promise<void> {
  if (rawPunchIds.length > 0) {
    await pool.query("DELETE FROM attendance_exceptions WHERE raw_punch_id = ANY($1::bigint[])", [rawPunchIds]);
  }
}

async function isValidPreviousOvernightPunch(employeeId: string, attendanceDate: string, punch: RawPunchRow): Promise<boolean> {
  const previousDate = addDays(attendanceDate, -1);
  const previousShift = await getShiftAssignmentForDate(employeeId, previousDate);
  if (!previousShift || !isOvernightShift(previousShift.start_time, previousShift.end_time, previousShift.is_overnight)) {
    return false;
  }

  const previousStart = toUtcFromIstDateTime(previousDate, previousShift.start_time);
  const previousEnd = toUtcFromIstDateTime(attendanceDate, previousShift.end_time);
  return punch.punch_time >= previousStart && punch.punch_time <= previousEnd;
}

async function syncOutOfShiftExceptions(
  employeeId: string,
  biometricId: number,
  attendanceDate: string,
  shift: ShiftAssignmentRow,
  localPunches: RawPunchRow[],
  validPunches: RawPunchRow[],
): Promise<void> {
  await deleteAttendanceExceptionsForRawPunchIds(validPunches.map((punch) => punch.id));
  const validPunchIds = new Set(validPunches.map((punch) => punch.id));

  for (const punch of localPunches) {
    if (validPunchIds.has(punch.id) || await isValidPreviousOvernightPunch(employeeId, attendanceDate, punch)) {
      continue;
    }

    await pool.query(
      `INSERT INTO attendance_exceptions (
        raw_punch_id, attendance_date, employee_id, biometric_id, shift_id, punch_time, exception_type, message
      ) VALUES ($1, $2::date, $3, $4, $5, $6, 'OUT_OF_SHIFT', 'Punch recorded outside assigned shift window')
      ON CONFLICT (raw_punch_id) DO UPDATE SET
        attendance_date = EXCLUDED.attendance_date,
        employee_id = EXCLUDED.employee_id,
        biometric_id = EXCLUDED.biometric_id,
        shift_id = EXCLUDED.shift_id,
        punch_time = EXCLUDED.punch_time,
        exception_type = EXCLUDED.exception_type,
        message = EXCLUDED.message`,
      [punch.id, attendanceDate, employeeId, biometricId, shift.shift_id, punch.punch_time],
    );
  }
}

export async function rebuildAttendanceForDate(date: string): Promise<void> {
  const attendanceDate = assertDate(date);
  const rawPunches = await getRawPunchesForDate(attendanceDate);
  const punchesByEmployee = new Map<string, RawPunchRow[]>();

  for (const punch of rawPunches) {
    if (punch.biometric_id === null) {
      continue;
    }

    if (punch.employee_id) {
      punchesByEmployee.set(punch.employee_id, [...(punchesByEmployee.get(punch.employee_id) ?? []), punch]);
    }
  }

  const processedEmployees = new Set<string>();

  for (const punch of rawPunches) {
    if (!punch.employee_id || punch.biometric_id === null) {
      continue;
    }

    if (processedEmployees.has(punch.employee_id)) {
      continue;
    }

    processedEmployees.add(punch.employee_id);
    const shift = await getShiftAssignmentForDate(punch.employee_id, attendanceDate);

    const localPunches = sortPunches((punchesByEmployee.get(punch.employee_id) ?? []).filter((entry) => toIstDateKey(entry.punch_time) === attendanceDate));
    const dateWindowPunches = sortPunches((punchesByEmployee.get(punch.employee_id) ?? []).filter((entry) => {
      const shiftAttendanceDate = toIstDateKey(entry.punch_time);
      return shiftAttendanceDate === attendanceDate || shiftAttendanceDate === addDays(attendanceDate, 1);
    }));

    const shiftId = shift?.shift_id ?? null;
    if (!shift || !shiftId || !shift.start_time || !shift.end_time) {
      if (localPunches.length === 0) {
        continue;
      }

      const first = localPunches[0]!;
      const last = localPunches[localPunches.length - 1]!;
      await upsertAttendanceRecord({
        attendance_key: attendanceKeyForEmployee(punch.employee_id, attendanceDate),
        attendance_date: attendanceDate,
        employee_id: punch.employee_id,
        biometric_id: Number(punch.biometric_id),
        shift_id: null,
        punch_in_at: first.punch_time,
        punch_out_at: last.id === first.id ? null : last.punch_time,
        working_minutes: last.id === first.id ? 0 : minutesBetween(first.punch_time, last.punch_time),
        raw_punch_count: localPunches.length,
        status: "NO_SHIFT",
        first_raw_punch_id: first.id,
        last_raw_punch_id: last.id,
        unmatched_raw_punch_id: null,
      });
      continue;
    }

    const shiftStart = toUtcFromIstDateTime(attendanceDate, shift.start_time);
    const overnight = isOvernightShift(shift.start_time, shift.end_time, shift.is_overnight);
    const shiftEndDate = overnight ? addDays(attendanceDate, 1) : attendanceDate;
    const shiftEnd = toUtcFromIstDateTime(shiftEndDate, shift.end_time);
    const windowEnd = attendanceWindowEnd(shiftEnd, overnight, shift.checkout_after_minutes);
    const windowStart = new Date(shiftStart.getTime() - shift.checkin_before_minutes * 60_000);
    const punchesInWindow = sortPunches(dateWindowPunches.filter((entry) => entry.punch_time >= windowStart && entry.punch_time <= windowEnd));

    await syncOutOfShiftExceptions(punch.employee_id, Number(punch.biometric_id), attendanceDate, shift, localPunches, punchesInWindow);

    if (punchesInWindow.length === 0) {
      continue;
    }

    const first = punchesInWindow[0]!;
    const last = punchesInWindow[punchesInWindow.length - 1]!;
    await upsertAttendanceRecord({
      attendance_key: attendanceKeyForEmployee(punch.employee_id, attendanceDate),
      attendance_date: attendanceDate,
      employee_id: punch.employee_id,
      biometric_id: Number(punch.biometric_id),
      shift_id: shiftId,
      punch_in_at: first.punch_time,
      punch_out_at: last.id === first.id ? null : last.punch_time,
      working_minutes: last.id === first.id ? 0 : minutesBetween(first.punch_time, last.punch_time),
      raw_punch_count: punchesInWindow.length,
      ...attendanceStatusForPunches(first, last, shiftStart, shiftEnd, shift),
      first_raw_punch_id: first.id,
      last_raw_punch_id: last.id,
      unmatched_raw_punch_id: null,
    });
  }

  for (const punch of rawPunches) {
    if (punch.employee_id || punch.biometric_id === null) {
      continue;
    }

    const punchDate = toIstDateKey(punch.punch_time);
    if (punchDate !== attendanceDate) {
      continue;
    }

    await upsertAttendanceRecord({
      attendance_key: attendanceKeyForUnmatched(punch.id),
      attendance_date: punchDate,
      employee_id: null,
      biometric_id: Number(punch.biometric_id),
      shift_id: null,
      punch_in_at: punch.punch_time,
      punch_out_at: null,
      working_minutes: 0,
      raw_punch_count: 1,
      status: "UNMATCHED",
      first_raw_punch_id: punch.id,
      last_raw_punch_id: punch.id,
      unmatched_raw_punch_id: punch.id,
    });
  }
}

export async function rebuildAttendanceForBiometricDate(biometricId: string, date: string): Promise<void> {
  const attendanceDate = assertDate(date);
  const rawPunches = await getRawPunchesForBiometricDate(biometricId, attendanceDate);
  const firstPunch = rawPunches[0];

  if (!firstPunch) {
    return;
  }

  if (!firstPunch.employee_id || firstPunch.biometric_id === null) {
    for (const punch of rawPunches) {
      if (punch.employee_id || punch.biometric_id === null || toIstDateKey(punch.punch_time) !== attendanceDate) {
        continue;
      }

      await upsertAttendanceRecord({
        attendance_key: attendanceKeyForUnmatched(punch.id),
        attendance_date: attendanceDate,
        employee_id: null,
        biometric_id: Number(punch.biometric_id),
        shift_id: null,
        punch_in_at: punch.punch_time,
        punch_out_at: null,
        working_minutes: 0,
        raw_punch_count: 1,
        status: "UNMATCHED",
        first_raw_punch_id: punch.id,
        last_raw_punch_id: punch.id,
        unmatched_raw_punch_id: punch.id,
      });
    }
    return;
  }

  const shift = await getShiftAssignmentForDate(firstPunch.employee_id, attendanceDate);
  const localPunches = sortPunches(rawPunches.filter((entry) => toIstDateKey(entry.punch_time) === attendanceDate));
  const shiftId = shift?.shift_id ?? null;

  if (!shift || !shiftId || !shift.start_time || !shift.end_time) {
    if (localPunches.length === 0) {
      return;
    }

    const first = localPunches[0]!;
    const last = localPunches[localPunches.length - 1]!;
    await upsertAttendanceRecord({
      attendance_key: attendanceKeyForEmployee(firstPunch.employee_id, attendanceDate),
      attendance_date: attendanceDate,
      employee_id: firstPunch.employee_id,
      biometric_id: Number(firstPunch.biometric_id),
      shift_id: null,
      punch_in_at: first.punch_time,
      punch_out_at: last.id === first.id ? null : last.punch_time,
      working_minutes: last.id === first.id ? 0 : minutesBetween(first.punch_time, last.punch_time),
      raw_punch_count: localPunches.length,
      status: "NO_SHIFT",
      first_raw_punch_id: first.id,
      last_raw_punch_id: last.id,
      unmatched_raw_punch_id: null,
    });
    return;
  }

  const shiftStart = toUtcFromIstDateTime(attendanceDate, shift.start_time);
  const overnight = isOvernightShift(shift.start_time, shift.end_time, shift.is_overnight);
  const shiftEndDate = overnight ? addDays(attendanceDate, 1) : attendanceDate;
  const shiftEnd = toUtcFromIstDateTime(shiftEndDate, shift.end_time);
  const windowEnd = attendanceWindowEnd(shiftEnd, overnight, shift.checkout_after_minutes);
  const windowStart = new Date(shiftStart.getTime() - shift.checkin_before_minutes * 60_000);
  const punchesInWindow = sortPunches(rawPunches.filter((entry) => entry.punch_time >= windowStart && entry.punch_time <= windowEnd));

  await syncOutOfShiftExceptions(firstPunch.employee_id, Number(firstPunch.biometric_id), attendanceDate, shift, localPunches, punchesInWindow);

  if (punchesInWindow.length === 0) {
    return;
  }

  const first = punchesInWindow[0]!;
  const last = punchesInWindow[punchesInWindow.length - 1]!;
  await upsertAttendanceRecord({
    attendance_key: attendanceKeyForEmployee(firstPunch.employee_id, attendanceDate),
    attendance_date: attendanceDate,
    employee_id: firstPunch.employee_id,
    biometric_id: Number(firstPunch.biometric_id),
    shift_id: shiftId,
    punch_in_at: first.punch_time,
    punch_out_at: last.id === first.id ? null : last.punch_time,
    working_minutes: last.id === first.id ? 0 : minutesBetween(first.punch_time, last.punch_time),
    raw_punch_count: punchesInWindow.length,
    ...attendanceStatusForPunches(first, last, shiftStart, shiftEnd, shift),
    first_raw_punch_id: first.id,
    last_raw_punch_id: last.id,
    unmatched_raw_punch_id: null,
  });
}

export async function rebuildAttendanceForAllActiveEmployees(date: string): Promise<{ processed: number }> {
  const attendanceDate = assertDate(date);
  await rebuildAttendanceForDate(attendanceDate);
  const employees = await pool.query<{ id: string; biometric_id: number; joining_date: string }>(
    "SELECT id, biometric_id, joining_date::text FROM employees WHERE active = true AND joining_date <= $1::date",
    [attendanceDate],
  );
  const holiday = await pool.query<{ id: string; name: string }>("SELECT id, name FROM holidays WHERE holiday_date = $1::date AND active = true", [attendanceDate]);
  const weekday = (new Date(`${attendanceDate}T00:00:00Z`).getUTCDay() + 6) % 7;

  for (const employee of employees.rows) {
    const shift = await getShiftAssignmentForDate(employee.id, attendanceDate);
    if (!shift) {
      await upsertAttendanceRecord({ attendance_key: attendanceKeyForEmployee(employee.id, attendanceDate), attendance_date: attendanceDate, employee_id: employee.id, biometric_id: Number(employee.biometric_id), shift_id: null, punch_in_at: null, punch_out_at: null, working_minutes: 0, raw_punch_count: 0, status: "NO_SHIFT", first_raw_punch_id: null, last_raw_punch_id: null, unmatched_raw_punch_id: null, note: "No applicable shift" });
      continue;
    }
    const existing = await pool.query("SELECT raw_punch_count FROM daily_attendance_records WHERE attendance_key = $1", [attendanceKeyForEmployee(employee.id, attendanceDate)]);
    if (Number(existing.rows[0]?.raw_punch_count ?? 0) > 0) continue;
    const now = attendanceNow();
    const overnight = isOvernightShift(shift.start_time, shift.end_time, shift.is_overnight);
    const shiftStart = toUtcFromIstDateTime(attendanceDate, shift.start_time);
    const shiftEnd = toUtcFromIstDateTime(overnight ? addDays(attendanceDate, 1) : attendanceDate, shift.end_time);
    const deadline = new Date(shiftEnd.getTime() + MISSING_PUNCH_BUFFER_MINUTES * 60_000);
    let status: AttendanceStatus; let note: string;
    if (holiday.rows[0]) { status="HOLIDAY"; note=holiday.rows[0]!.name; }
    else if (shift.weekly_off_days.includes(weekday)) { status="WEEKLY_OFF"; note="Weekly off"; }
    else if (now < shiftStart) { status="PENDING"; note="Shift not started"; }
    else if (now < deadline) { status="CHECK_IN_MISSING"; note=now < new Date(shiftStart.getTime()+shift.grace_minutes*60_000) ? "Awaiting check-in" : "Check-in fingerprint missing"; }
    else { status="ABSENT"; note="No biometric attendance recorded"; }
    await upsertAttendanceRecord({ attendance_key: attendanceKeyForEmployee(employee.id, attendanceDate), attendance_date: attendanceDate, employee_id: employee.id, biometric_id: Number(employee.biometric_id), shift_id: shift.shift_id, punch_in_at: null, punch_out_at: null, working_minutes: 0, raw_punch_count: 0, status, first_raw_punch_id: null, last_raw_punch_id: null, unmatched_raw_punch_id: null, holiday_id: status === "HOLIDAY" ? holiday.rows[0]!.id : null, note });
  }
  return { processed: employees.rowCount ?? 0 };
}

export async function listAttendance(filters: AttendanceFilters): Promise<AttendanceRecord[]> {
  const clauses = ["a.attendance_date = $1::date"];
  const params: unknown[] = [assertDate(filters.date)];
  let parameterIndex = 2;

  if (filters.employeeId) {
    clauses.push(`a.employee_id = $${parameterIndex}`);
    params.push(filters.employeeId);
    parameterIndex += 1;
  }

  if (filters.shiftId) {
    clauses.push(`a.shift_id = $${parameterIndex}`);
    params.push(filters.shiftId);
    parameterIndex += 1;
  }

  if (filters.status) {
    clauses.push(`a.status = $${parameterIndex}`);
    params.push(filters.status);
    parameterIndex += 1;
  }

  const result = await pool.query<AttendanceRecord>(
    `SELECT
      a.attendance_key,
      a.attendance_date::text AS attendance_date,
      a.biometric_id,
      a.employee_id,
      e.name AS employee_name,
      COALESCE(e.employee_code, '—') AS employee_code,
      a.shift_id,
      s.name AS shift_name,
      a.punch_in_at,
      a.punch_out_at,
      a.working_minutes,
      a.raw_punch_count,
      a.late_minutes,
      a.early_exit_minutes,
      a.note,
      a.holiday_id,
      a.status,
      a.first_raw_punch_id,
      a.last_raw_punch_id,
      a.unmatched_raw_punch_id
     FROM daily_attendance_records a
     LEFT JOIN employees e ON e.id = a.employee_id
     LEFT JOIN shifts s ON s.id = a.shift_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY a.status ASC, a.punch_in_at ASC NULLS LAST, a.biometric_id ASC, a.attendance_key ASC`,
    params,
  );

  return result.rows;
}

export async function listAttendanceExceptions(date: string): Promise<AttendanceException[]> {
  const result = await pool.query<AttendanceException>(
    `SELECT
      x.raw_punch_id,
      x.attendance_date::text AS attendance_date,
      x.employee_id,
      e.name AS employee_name,
      x.biometric_id,
      x.shift_id,
      s.name AS shift_name,
      x.punch_time,
      x.exception_type,
      x.message
     FROM attendance_exceptions x
     JOIN employees e ON e.id = x.employee_id
     JOIN shifts s ON s.id = x.shift_id
     WHERE x.attendance_date = $1::date
     ORDER BY x.punch_time ASC, x.raw_punch_id ASC`,
    [assertDate(date)],
  );

  return result.rows;
}

export async function getAttendanceSummary(date: string): Promise<AttendanceDashboardSummary> {
  const attendanceDate = assertDate(date);
  const result = await pool.query<AttendanceDashboardSummary>(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'PRESENT')::int AS "presentToday",
      COUNT(*) FILTER (WHERE status = 'MISSING_PUNCH' AND punch_out_at IS NULL)::int AS "currentlyCheckedIn",
      COUNT(*) FILTER (WHERE status = 'MISSING_PUNCH')::int AS "missingPunchOut",
      COUNT(*) FILTER (WHERE status = 'UNMATCHED')::int AS "unmatchedPunches"
     FROM daily_attendance_records
     WHERE attendance_date = $1::date`,
    [attendanceDate],
  );

  return result.rows[0] ?? { presentToday: 0, currentlyCheckedIn: 0, missingPunchOut: 0, unmatchedPunches: 0 };
}
