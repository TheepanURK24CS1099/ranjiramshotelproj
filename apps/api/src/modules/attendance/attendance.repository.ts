import { getDatabasePool } from "../../infrastructure/database/database.js";

const pool = getDatabasePool();
const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MISSING_PUNCH_BUFFER_MINUTES = 15;
function attendanceNow(): Date {
  const value = process.env.ATTENDANCE_TEST_NOW;
  return value ? new Date(value) : new Date();
}

export type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "EARLY_EXIT"
  | "LATE_AND_EARLY_EXIT"
  | "HALF_DAY"
  | "ABSENT"
  | "MISSING_PUNCH"
  | "CURRENTLY_CHECKED_IN"
  | "PENDING"
  | "CHECK_IN_MISSING"
  | "WEEKLY_OFF"
  | "HOLIDAY"
  | "NO_SHIFT"
  | "UNMATCHED";

export type SessionStatus =
  | "NOT_STARTED"
  | "CURRENTLY_CHECKED_IN"
  | "COMPLETED"
  | "MISSING_IN"
  | "CHECK_IN_MISSING"
  | "MISSING_OUT"
  | "LATE"
  | "EARLY_EXIT"
  | "LATE_AND_EARLY_EXIT"
  | "EXCEPTION";

export interface SessionRecord {
  session_id?: string;
  session_number: number;
  session_name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  grace_minutes: number;
  minimum_work_minutes: number;
  early_exit_tolerance_minutes: number;
  checkin_before_minutes: number;
  checkout_after_minutes: number;
  punch_in_id: number | null;
  punch_in_at: string | null;
  punch_out_id: number | null;
  punch_out_at: string | null;
  worked_minutes: number;
  expected_minutes: number;
  late_minutes: number;
  early_exit_minutes: number;
  missing_punch: boolean;
  status: SessionStatus;
}

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
  session_records?: SessionRecord[];
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

export interface ShiftSessionRow {
  id: string;
  shift_id: string;
  session_number: number;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  minimum_work_minutes: number;
  early_exit_tolerance_minutes: number;
  checkin_before_minutes: number;
  checkout_after_minutes: number;
  crosses_midnight: boolean;
  active: boolean;
}

export interface ShiftAssignmentWithSessions extends ShiftAssignmentRow {
  sessions: ShiftSessionRow[];
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

type AttendanceUpsertRecord = Omit<
  AttendanceRecord,
  "employee_name" | "employee_code" | "shift_name" | "late_minutes" | "early_exit_minutes" | "note" | "holiday_id"
> &
  Partial<Pick<AttendanceRecord, "late_minutes" | "early_exit_minutes" | "note" | "holiday_id" | "session_records">>;

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
  const sessionRecordsJson = JSON.stringify(record.session_records ?? []);
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
      unmatched_raw_punch_id,
      holiday_id,
      session_records
    ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
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
      unmatched_raw_punch_id = EXCLUDED.unmatched_raw_punch_id,
      session_records = EXCLUDED.session_records`,
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
      sessionRecordsJson,
    ]
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
    [assertDate(date)]
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
    [biometricId, assertDate(date)]
  );

  return result.rows;
}

async function getShiftAssignmentForDate(employeeId: string, date: string): Promise<ShiftAssignmentWithSessions | null> {
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
    [employeeId, date]
  );

  const shift = result.rows[0];
  if (!shift) return null;

  const sessionsRes = await pool.query<ShiftSessionRow>(
    `SELECT * FROM shift_sessions WHERE shift_id = $1 AND active = true ORDER BY session_number ASC`,
    [shift.shift_id]
  );

  let sessions = sessionsRes.rows;
  if (sessions.length === 0) {
    sessions = [
      {
        id: shift.shift_id,
        shift_id: shift.shift_id,
        session_number: 1,
        start_time: shift.start_time,
        end_time: shift.end_time,
        grace_minutes: shift.grace_minutes,
        minimum_work_minutes: shift.minimum_work_minutes,
        early_exit_tolerance_minutes: shift.early_exit_tolerance_minutes,
        checkin_before_minutes: shift.checkin_before_minutes,
        checkout_after_minutes: shift.checkout_after_minutes,
        crosses_midnight: shift.is_overnight,
        active: true,
      },
    ];
  }

  return { ...shift, sessions };
}

async function deleteAttendanceExceptionsForRawPunchIds(rawPunchIds: number[]): Promise<void> {
  if (rawPunchIds.length > 0) {
    await pool.query("DELETE FROM attendance_exceptions WHERE raw_punch_id = ANY($1::bigint[])", [rawPunchIds]);
  }
}

async function syncOutOfShiftExceptions(
  employeeId: string,
  biometricId: number,
  attendanceDate: string,
  shift: ShiftAssignmentWithSessions,
  localPunches: RawPunchRow[],
  validPunches: RawPunchRow[]
): Promise<void> {
  await deleteAttendanceExceptionsForRawPunchIds(validPunches.map((punch) => punch.id));
  const validPunchIds = new Set(validPunches.map((punch) => punch.id));

  for (const punch of localPunches) {
    if (validPunchIds.has(punch.id)) {
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
      [punch.id, attendanceDate, employeeId, biometricId, shift.shift_id, punch.punch_time]
    );
  }
}

function evaluateMultiSessionAttendance(
  attendanceDate: string,
  shift: ShiftAssignmentWithSessions,
  dateWindowPunches: RawPunchRow[]
): {
  sessionRecords: SessionRecord[];
  allAssignedPunches: RawPunchRow[];
  totalWorkingMinutes: number;
  totalLateMinutes: number;
  totalEarlyExitMinutes: number;
  missingPunchCount: number;
  firstPunchIn: Date | null;
  lastPunchOut: Date | null;
  overallStatus: AttendanceStatus;
  note: string | null;
} {
  const sortedPunches = sortPunches(dateWindowPunches);
  const now = attendanceNow();
  const sessionRecords: SessionRecord[] = [];
  const assignedPunchIds = new Set<number>();
  const assignedPunchRows: RawPunchRow[] = [];

  const sessionWindows = shift.sessions.map((s) => {
    const sStart = toUtcFromIstDateTime(attendanceDate, s.start_time);
    const sOvernight = s.crosses_midnight || isOvernightShift(s.start_time, s.end_time, s.crosses_midnight);
    const sEndDate = sOvernight ? addDays(attendanceDate, 1) : attendanceDate;
    const sEnd = toUtcFromIstDateTime(sEndDate, s.end_time);
    const winStart = new Date(sStart.getTime() - (s.checkin_before_minutes ?? 0) * 60_000);
    const winEnd = new Date(sEnd.getTime() + (s.checkout_after_minutes ?? 60) * 60_000);
    const deadline = new Date(sEnd.getTime() + MISSING_PUNCH_BUFFER_MINUTES * 60_000);
    const expectedMinutes = minutesBetween(sStart, sEnd);

    return {
      session: s,
      sStart,
      sEnd,
      winStart,
      winEnd,
      deadline,
      expectedMinutes,
      sOvernight,
    };
  });

  const sessionAssignedPunchesMap = new Map<number, RawPunchRow[]>();
  for (const sw of sessionWindows) {
    sessionAssignedPunchesMap.set(sw.session.session_number, []);
  }

  for (const punch of sortedPunches) {
    const matchingSessions = sessionWindows.filter(
      (sw) => punch.punch_time >= sw.winStart && punch.punch_time <= sw.winEnd
    );

    if (matchingSessions.length === 0) {
      continue;
    }

    let targetSw = matchingSessions[0]!;
    if (matchingSessions.length > 1) {
      targetSw = matchingSessions.reduce((closest, curr) => {
        const distClosestStart = Math.abs(punch.punch_time.getTime() - closest.sStart.getTime());
        const distClosestEnd = Math.abs(punch.punch_time.getTime() - closest.sEnd.getTime());
        const minClosest = Math.min(distClosestStart, distClosestEnd);

        const distCurrStart = Math.abs(punch.punch_time.getTime() - curr.sStart.getTime());
        const distCurrEnd = Math.abs(punch.punch_time.getTime() - curr.sEnd.getTime());
        const minCurr = Math.min(distCurrStart, distCurrEnd);

        return minCurr < minClosest ? curr : closest;
      });
    }

    if (!assignedPunchIds.has(punch.id)) {
      assignedPunchIds.add(punch.id);
      assignedPunchRows.push(punch);
      sessionAssignedPunchesMap.get(targetSw.session.session_number)!.push(punch);
    }
  }

  if (sortedPunches.length === 0) {
    const firstSw = sessionWindows[0]!;
    const lastSw = sessionWindows[sessionWindows.length - 1]!;
    let overallStatus: AttendanceStatus = "PRESENT";
    let note: string | null = null;

    if (now < firstSw.sStart) {
      overallStatus = "PENDING";
      note = "Shift not started";
    } else if (now >= lastSw.deadline) {
      overallStatus = "ABSENT";
      note = "No biometric attendance recorded";
    } else {
      overallStatus = "CHECK_IN_MISSING";
      note =
        now < new Date(firstSw.sStart.getTime() + (firstSw.session.grace_minutes ?? 0) * 60_000)
          ? "Awaiting check-in"
          : "Check-in fingerprint missing";
    }

    return {
      sessionRecords: [],
      allAssignedPunches: [],
      totalWorkingMinutes: 0,
      totalLateMinutes: 0,
      totalEarlyExitMinutes: 0,
      missingPunchCount: 0,
      firstPunchIn: null,
      lastPunchOut: null,
      overallStatus,
      note,
    };
  }

  let totalWorkingMinutes = 0;
  let totalLateMinutes = 0;
  let totalEarlyExitMinutes = 0;
  let missingPunchCount = 0;
  let hasOutOfShiftCheckout = false;

  for (let i = 0; i < sessionWindows.length; i++) {
    const sw = sessionWindows[i]!;
    const s = sw.session;
    const punches = sortPunches(sessionAssignedPunchesMap.get(s.session_number) ?? []);

    let punchInAt: Date | null = null;
    let punchInId: number | null = null;
    let punchOutAt: Date | null = null;
    let punchOutId: number | null = null;
    let workedMinutes = 0;
    let lateMinutes = 0;
    let earlyExitMinutes = 0;
    let missingPunch = false;
    let status: SessionStatus = "NOT_STARTED";

    if (punches.length === 0) {
      if (now < sw.sStart) {
        status = "NOT_STARTED";
      } else {
        status = "CHECK_IN_MISSING";
        missingPunch = true;
      }
    } else if (punches.length === 1) {
      const p1 = punches[0]!;
      const noRules = s.grace_minutes === 0 && s.minimum_work_minutes === 0 && s.early_exit_tolerance_minutes === 0;
      if (now < sw.deadline) {
        punchInAt = p1.punch_time;
        punchInId = p1.id;
        lateMinutes = noRules ? 0 : Math.max(0, minutesBetween(new Date(sw.sStart.getTime() + s.grace_minutes * 60_000), p1.punch_time));
        status = "CURRENTLY_CHECKED_IN";
      } else {
        const distStart = Math.abs(p1.punch_time.getTime() - sw.sStart.getTime());
        const distEnd = Math.abs(p1.punch_time.getTime() - sw.sEnd.getTime());

        if (distStart <= distEnd) {
          punchInAt = p1.punch_time;
          punchInId = p1.id;
          lateMinutes = noRules ? 0 : Math.max(0, minutesBetween(new Date(sw.sStart.getTime() + s.grace_minutes * 60_000), p1.punch_time));
          missingPunch = true;
          status = "MISSING_OUT";
        } else {
          punchOutAt = p1.punch_time;
          punchOutId = p1.id;
          earlyExitMinutes = noRules ? 0 : Math.max(
            0,
            minutesBetween(p1.punch_time, new Date(sw.sEnd.getTime() - s.early_exit_tolerance_minutes * 60_000))
          );
          missingPunch = true;
          status = "MISSING_IN";
        }
      }
    } else {
      const first = punches[0]!;
      const last = punches[punches.length - 1]!;

      if (first.id === last.id) {
        if (now < sw.deadline) {
          punchInAt = first.punch_time;
          punchInId = first.id;
          lateMinutes = Math.max(0, minutesBetween(new Date(sw.sStart.getTime() + s.grace_minutes * 60_000), first.punch_time));
          status = "CURRENTLY_CHECKED_IN";
        } else {
          punchInAt = first.punch_time;
          punchInId = first.id;
          lateMinutes = Math.max(0, minutesBetween(new Date(sw.sStart.getTime() + s.grace_minutes * 60_000), first.punch_time));
          missingPunch = true;
          status = "MISSING_OUT";
        }
      } else {
        punchInAt = first.punch_time;
        punchInId = first.id;
        punchOutAt = last.punch_time;
        punchOutId = last.id;

        workedMinutes = minutesBetween(first.punch_time, last.punch_time);
        lateMinutes = Math.max(0, minutesBetween(new Date(sw.sStart.getTime() + s.grace_minutes * 60_000), first.punch_time));
        earlyExitMinutes = Math.max(
          0,
          minutesBetween(last.punch_time, new Date(sw.sEnd.getTime() - s.early_exit_tolerance_minutes * 60_000))
        );

        if (s.grace_minutes === 0 && s.minimum_work_minutes === 0 && s.early_exit_tolerance_minutes === 0) {
          lateMinutes = 0;
          earlyExitMinutes = 0;
        } else {
          lateMinutes = Math.max(0, minutesBetween(new Date(sw.sStart.getTime() + s.grace_minutes * 60_000), first.punch_time));
          earlyExitMinutes = Math.max(
            0,
            minutesBetween(last.punch_time, new Date(sw.sEnd.getTime() - s.early_exit_tolerance_minutes * 60_000))
          );
        }

        if (lateMinutes > 0 && earlyExitMinutes > 0) {
          status = "LATE_AND_EARLY_EXIT";
        } else if (lateMinutes > 0) {
          status = "LATE";
        } else if (earlyExitMinutes > 0) {
          status = "EARLY_EXIT";
        } else {
          status = "COMPLETED";
        }
      }
    }

    if (punchInAt !== null && punchOutAt === null && now >= sw.deadline && status === "MISSING_OUT") {
      const nextSw = sessionWindows[i + 1];
      const suitableLaterPunches = sortedPunches.filter((p) => {
        if (assignedPunchIds.has(p.id)) return false;
        if (p.punch_time <= punchInAt!) return false;
        if (nextSw && p.punch_time >= nextSw.winStart) return false;

        const punchDate = toIstDateKey(p.punch_time);
        if (sw.sOvernight) {
          return punchDate === attendanceDate || punchDate === addDays(attendanceDate, 1);
        }
        return punchDate === attendanceDate;
      });

      if (suitableLaterPunches.length === 1) {
        const reusedPunch = suitableLaterPunches[0]!;
        punchOutAt = reusedPunch.punch_time;
        punchOutId = reusedPunch.id;
        workedMinutes = minutesBetween(punchInAt, reusedPunch.punch_time);
        earlyExitMinutes = Math.max(
          0,
          minutesBetween(reusedPunch.punch_time, new Date(sw.sEnd.getTime() - s.early_exit_tolerance_minutes * 60_000))
        );
        missingPunch = false;
        hasOutOfShiftCheckout = true;

        if (lateMinutes > 0 && earlyExitMinutes > 0) {
          status = "LATE_AND_EARLY_EXIT";
        } else if (lateMinutes > 0) {
          status = "LATE";
        } else if (earlyExitMinutes > 0) {
          status = "EARLY_EXIT";
        } else {
          status = "COMPLETED";
        }
      }
    }

    if (missingPunch) {
      missingPunchCount++;
    }
    totalWorkingMinutes += workedMinutes;
    totalLateMinutes += lateMinutes;
    totalEarlyExitMinutes += earlyExitMinutes;

    sessionRecords.push({
      session_id: s.id,
      session_number: s.session_number,
      session_name: `Session ${s.session_number}`,
      start_time: s.start_time,
      end_time: s.end_time,
      crosses_midnight: s.crosses_midnight,
      grace_minutes: s.grace_minutes,
      minimum_work_minutes: s.minimum_work_minutes,
      early_exit_tolerance_minutes: s.early_exit_tolerance_minutes,
      checkin_before_minutes: s.checkin_before_minutes,
      checkout_after_minutes: s.checkout_after_minutes,
      punch_in_id: punchInId,
      punch_in_at: punchInAt ? punchInAt.toISOString() : null,
      punch_out_id: punchOutId,
      punch_out_at: punchOutAt ? punchOutAt.toISOString() : null,
      worked_minutes: workedMinutes,
      expected_minutes: sw.expectedMinutes,
      late_minutes: lateMinutes,
      early_exit_minutes: earlyExitMinutes,
      missing_punch: missingPunch,
      status,
    });
  }

  let firstPunchIn: Date | null = null;
  let lastPunchOut: Date | null = null;

  for (const sr of sessionRecords) {
    if (sr.punch_in_at) {
      const d = new Date(sr.punch_in_at);
      if (!firstPunchIn || d < firstPunchIn) firstPunchIn = d;
    }
    if (sr.punch_out_at) {
      const d = new Date(sr.punch_out_at);
      if (!lastPunchOut || d > lastPunchOut) lastPunchOut = d;
    }
  }

  const totalMinWorkReq = shift.sessions.reduce((sum, s) => sum + (s.minimum_work_minutes ?? 0), 0);

  let overallStatus: AttendanceStatus = "PRESENT";
  let note: string | null = null;

  const completedSessions = sessionRecords.filter(
    (sr) =>
      sr.status === "COMPLETED" ||
      sr.status === "LATE" ||
      sr.status === "EARLY_EXIT" ||
      sr.status === "LATE_AND_EARLY_EXIT"
  );
  const anyMissing = sessionRecords.some((sr) => sr.status === "MISSING_IN" || sr.status === "CHECK_IN_MISSING" || sr.status === "MISSING_OUT");
  const anyCheckedIn = sessionRecords.some((sr) => sr.status === "CURRENTLY_CHECKED_IN");
  const allNotStarted = sessionRecords.every((sr) => sr.status === "NOT_STARTED");

  const firstSw = sessionWindows[0]!;
  const lastSw = sessionWindows[sessionWindows.length - 1]!;

  if (anyCheckedIn) {
    overallStatus = "CURRENTLY_CHECKED_IN";
    note = totalLateMinutes ? `Late by ${totalLateMinutes} minutes; awaiting punch out` : "Awaiting punch out";
  } else if (completedSessions.length > 0) {
    if (!anyMissing && totalMinWorkReq > 0 && totalWorkingMinutes < totalMinWorkReq) {
      overallStatus = "HALF_DAY";
      note = "Below minimum working minutes";
    } else if (totalLateMinutes > 0 && totalEarlyExitMinutes > 0) {
      overallStatus = "LATE_AND_EARLY_EXIT";
    } else if (totalLateMinutes > 0) {
      overallStatus = "LATE";
    } else if (totalEarlyExitMinutes > 0) {
      overallStatus = "EARLY_EXIT";
    } else {
      overallStatus = "PRESENT";
    }

    if (hasOutOfShiftCheckout) {
      note = "Checkout outside shift window";
    }
  } else if (assignedPunchIds.size === 0) {
    if (allNotStarted) {
      overallStatus = "PENDING";
      note = "Shift not started";
    } else if (now >= lastSw.deadline && sessionRecords.every((sr) => sr.status === "MISSING_IN" || sr.status === "CHECK_IN_MISSING")) {
      overallStatus = "ABSENT";
      note = "No biometric attendance recorded";
    } else {
      overallStatus = "CHECK_IN_MISSING";
      note = now < new Date(firstSw.sStart.getTime() + (firstSw.session.grace_minutes ?? 0) * 60_000)
        ? "Awaiting check-in"
        : "Check-in fingerprint missing";
    }
  } else if (anyMissing) {
    overallStatus = "MISSING_PUNCH";
    note = "Missing punch out";
  } else if (totalMinWorkReq > 0 && totalWorkingMinutes < totalMinWorkReq) {
    overallStatus = "HALF_DAY";
    note = "Below minimum working minutes";
  } else if (totalLateMinutes > 0 && totalEarlyExitMinutes > 0) {
    overallStatus = "LATE_AND_EARLY_EXIT";
  } else if (totalLateMinutes > 0) {
    overallStatus = "LATE";
  } else if (totalEarlyExitMinutes > 0) {
    overallStatus = "EARLY_EXIT";
  } else {
    overallStatus = "PRESENT";
  }

  if (hasOutOfShiftCheckout && !anyCheckedIn) {
    note = "Checkout outside shift window";
  }

  return {
    sessionRecords,
    allAssignedPunches: assignedPunchRows,
    totalWorkingMinutes,
    totalLateMinutes,
    totalEarlyExitMinutes,
    missingPunchCount,
    firstPunchIn,
    lastPunchOut,
    overallStatus,
    note,
  };
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

    if (!shift || !shift.shift_id) {
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

    const evalResult = evaluateMultiSessionAttendance(attendanceDate, shift, dateWindowPunches);

    await syncOutOfShiftExceptions(
      punch.employee_id,
      Number(punch.biometric_id),
      attendanceDate,
      shift,
      localPunches,
      evalResult.allAssignedPunches
    );

    if (evalResult.allAssignedPunches.length === 0 && evalResult.overallStatus === "PENDING") {
      // Keep pending record or sync status
    }

    const sessionPunchIds = (evalResult.sessionRecords ?? [])
      .flatMap((sr) => [sr.punch_in_id, sr.punch_out_id])
      .filter((id): id is number => id !== null);

    const firstP = evalResult.allAssignedPunches[0];
    const lastP = evalResult.allAssignedPunches[evalResult.allAssignedPunches.length - 1];
    const firstRawPunchId = sessionPunchIds[0] ?? (firstP ? firstP.id : null);
    const lastRawPunchId = sessionPunchIds.length > 0 ? sessionPunchIds[sessionPunchIds.length - 1]! : (lastP ? lastP.id : null);
    const rawPunchCount = Math.max(evalResult.allAssignedPunches.length, new Set(sessionPunchIds).size);

    await upsertAttendanceRecord({
      attendance_key: attendanceKeyForEmployee(punch.employee_id, attendanceDate),
      attendance_date: attendanceDate,
      employee_id: punch.employee_id,
      biometric_id: Number(punch.biometric_id),
      shift_id: shift.shift_id,
      punch_in_at: evalResult.firstPunchIn,
      punch_out_at: evalResult.lastPunchOut,
      working_minutes: evalResult.totalWorkingMinutes,
      late_minutes: evalResult.totalLateMinutes,
      early_exit_minutes: evalResult.totalEarlyExitMinutes,
      raw_punch_count: rawPunchCount,
      status: evalResult.overallStatus,
      note: evalResult.note,
      first_raw_punch_id: firstRawPunchId,
      last_raw_punch_id: lastRawPunchId,
      unmatched_raw_punch_id: null,
      session_records: evalResult.sessionRecords,
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

  if (!shift || !shift.shift_id) {
    if (localPunches.length === 0) return;
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

  const evalResult = evaluateMultiSessionAttendance(attendanceDate, shift, rawPunches);

  await syncOutOfShiftExceptions(
    firstPunch.employee_id,
    Number(firstPunch.biometric_id),
    attendanceDate,
    shift,
    localPunches,
    evalResult.allAssignedPunches
  );

  const sessionPunchIds = (evalResult.sessionRecords ?? [])
    .flatMap((sr) => [sr.punch_in_id, sr.punch_out_id])
    .filter((id): id is number => id !== null);

  const firstP = evalResult.allAssignedPunches[0];
  const lastP = evalResult.allAssignedPunches[evalResult.allAssignedPunches.length - 1];
  const firstRawPunchId = sessionPunchIds[0] ?? (firstP ? firstP.id : null);
  const lastRawPunchId = sessionPunchIds.length > 0 ? sessionPunchIds[sessionPunchIds.length - 1]! : (lastP ? lastP.id : null);
  const rawPunchCount = Math.max(evalResult.allAssignedPunches.length, new Set(sessionPunchIds).size);

  await upsertAttendanceRecord({
    attendance_key: attendanceKeyForEmployee(firstPunch.employee_id, attendanceDate),
    attendance_date: attendanceDate,
    employee_id: firstPunch.employee_id,
    biometric_id: Number(firstPunch.biometric_id),
    shift_id: shift.shift_id,
    punch_in_at: evalResult.firstPunchIn,
    punch_out_at: evalResult.lastPunchOut,
    working_minutes: evalResult.totalWorkingMinutes,
    late_minutes: evalResult.totalLateMinutes,
    early_exit_minutes: evalResult.totalEarlyExitMinutes,
    raw_punch_count: rawPunchCount,
    status: evalResult.overallStatus,
    note: evalResult.note,
    first_raw_punch_id: firstRawPunchId,
    last_raw_punch_id: lastRawPunchId,
    unmatched_raw_punch_id: null,
    session_records: evalResult.sessionRecords,
  });
}

export async function rebuildAttendanceForAllActiveEmployees(date: string): Promise<{ processed: number }> {
  const attendanceDate = assertDate(date);
  await rebuildAttendanceForDate(attendanceDate);
  const employees = await pool.query<{ id: string; biometric_id: number; joining_date: string }>(
    "SELECT id, biometric_id, joining_date::text FROM employees WHERE active = true AND joining_date <= $1::date",
    [attendanceDate]
  );
  const holiday = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM holidays WHERE holiday_date = $1::date AND active = true",
    [attendanceDate]
  );
  const weekday = (new Date(`${attendanceDate}T00:00:00Z`).getUTCDay() + 6) % 7;

  for (const employee of employees.rows) {
    const shift = await getShiftAssignmentForDate(employee.id, attendanceDate);
    if (!shift) {
      await upsertAttendanceRecord({
        attendance_key: attendanceKeyForEmployee(employee.id, attendanceDate),
        attendance_date: attendanceDate,
        employee_id: employee.id,
        biometric_id: Number(employee.biometric_id),
        shift_id: null,
        punch_in_at: null,
        punch_out_at: null,
        working_minutes: 0,
        raw_punch_count: 0,
        status: "NO_SHIFT",
        first_raw_punch_id: null,
        last_raw_punch_id: null,
        unmatched_raw_punch_id: null,
        note: "No applicable shift",
      });
      continue;
    }

    const existing = await pool.query(
      "SELECT raw_punch_count FROM daily_attendance_records WHERE attendance_key = $1",
      [attendanceKeyForEmployee(employee.id, attendanceDate)]
    );
    if (Number(existing.rows[0]?.raw_punch_count ?? 0) > 0) continue;

    const evalResult = evaluateMultiSessionAttendance(attendanceDate, shift, []);

    let status: AttendanceStatus = evalResult.overallStatus;
    let note: string | null = evalResult.note;

    if (holiday.rows[0]) {
      status = "HOLIDAY";
      note = holiday.rows[0]!.name;
    } else if (shift.weekly_off_days.includes(weekday)) {
      status = "WEEKLY_OFF";
      note = "Weekly off";
    }

    await upsertAttendanceRecord({
      attendance_key: attendanceKeyForEmployee(employee.id, attendanceDate),
      attendance_date: attendanceDate,
      employee_id: employee.id,
      biometric_id: Number(employee.biometric_id),
      shift_id: shift.shift_id,
      punch_in_at: null,
      punch_out_at: null,
      working_minutes: 0,
      raw_punch_count: 0,
      status,
      first_raw_punch_id: null,
      last_raw_punch_id: null,
      unmatched_raw_punch_id: null,
      holiday_id: status === "HOLIDAY" ? holiday.rows[0]!.id : null,
      note,
      session_records: evalResult.sessionRecords,
    });
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
      a.unmatched_raw_punch_id,
      a.session_records
     FROM daily_attendance_records a
     LEFT JOIN employees e ON e.id = a.employee_id
     LEFT JOIN shifts s ON s.id = a.shift_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY a.status ASC, a.punch_in_at ASC NULLS LAST, a.biometric_id ASC, a.attendance_key ASC`,
    params
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
    [assertDate(date)]
  );

  return result.rows;
}

export async function getAttendanceSummary(date: string): Promise<AttendanceDashboardSummary> {
  const attendanceDate = assertDate(date);
  const result = await pool.query<AttendanceDashboardSummary>(
    `SELECT
      COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE', 'EARLY_EXIT', 'LATE_AND_EARLY_EXIT'))::int AS "presentToday",
      COUNT(*) FILTER (WHERE status = 'CURRENTLY_CHECKED_IN')::int AS "currentlyCheckedIn",
      COUNT(*) FILTER (WHERE status = 'MISSING_PUNCH')::int AS "missingPunchOut",
      COUNT(*) FILTER (WHERE status = 'UNMATCHED')::int AS "unmatchedPunches"
     FROM daily_attendance_records
     WHERE attendance_date = $1::date`,
    [attendanceDate]
  );

  return result.rows[0] ?? { presentToday: 0, currentlyCheckedIn: 0, missingPunchOut: 0, unmatchedPunches: 0 };
}
