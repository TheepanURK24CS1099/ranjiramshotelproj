import { getDatabasePool } from "../../infrastructure/database/database.js";
import * as salariesRepo from "./salaries.repository.js";
import * as advancesRepo from "../advances/advances.repository.js";

const pool = getDatabasePool();

export const FIXED_SALARY_BASIS_DAYS = 30;

export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateDailySalaryRate(monthlySalary: number): number {
  return roundMoney(monthlySalary / FIXED_SALARY_BASIS_DAYS);
}

export function isFullCalendarMonth(fromDate: string, toDate: string): boolean {
  if (!fromDate.endsWith("-01")) return false;
  const [yearStr, monthStr] = fromDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return toDate === lastDay;
}

export function calculateEarnedSalary(
  monthlySalary: number,
  presentSalaryDays: number,
  absentSalaryDays: number,
  isFullMonth = false,
): number {
  const dailyRate = monthlySalary / FIXED_SALARY_BASIS_DAYS;
  if (isFullMonth) {
    const absenceDeduction = roundMoney(absentSalaryDays * dailyRate);
    return Math.min(monthlySalary, Math.max(0, monthlySalary - absenceDeduction));
  }
  return roundMoney(presentSalaryDays * dailyRate);
}

export interface SalaryCalculationPeriodResult {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  joiningDate: string | null;
  eligibleCalendarDays: number;
  isFullMonth: boolean;
  salaryRecord: {
    id: string | null;
    salaryType: "MONTHLY" | "DAILY" | "HOURLY";
    monthlySalary: number;
    dailyRate: number;
    hourlyRate: number;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  } | null;
  attendanceCounts: {
    present: number;
    late: number;
    earlyExit: number;
    lateAndEarlyExit: number;
    halfDay: number;
    absent: number;
    weeklyOff: number;
    holiday: number;
    missingPunch: number;
    currentlyCheckedIn: number;
    checkOutMissing: number;
    noShift: number;
    unmatched: number;
    totalRecorded: number;
    totalWorkMinutes: number;
  };
  presentSalaryDays: number;
  absentSalaryDays: number;
  salaryBasisDays: number;
  dailySalaryRate: number;
  absenceDeduction: number;
  earnedSalary: number;
  advanceBalance: number;
  netPayableSalary: number;
  hasSalaryRevisions: boolean;
}

export async function calculateEmployeeSalaryForPeriod(
  employeeId: string,
  fromDate: string,
  toDate: string,
): Promise<SalaryCalculationPeriodResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new Error("Validation: Valid fromDate and toDate (YYYY-MM-DD) are required");
  }
  if (fromDate > toDate) {
    throw new Error("Validation: fromDate must not be after toDate");
  }

  // 1. Fetch employee joining date & active status
  const empRes = await pool.query<{ id: string; joining_date: string | null; active: boolean }>(
    "SELECT id, joining_date::text, active FROM employees WHERE id=$1",
    [employeeId],
  );
  if (!empRes.rows[0]) {
    throw new Error("Not Found: Employee not found");
  }
  const emp = empRes.rows[0];

  // 2. Fetch all effective salary records overlapping the period
  const salaryRecords = await salariesRepo.getEffectiveSalariesForPeriod(employeeId, fromDate, toDate);
  const primarySalary = salaryRecords[salaryRecords.length - 1] ?? null;
  const hasSalaryRevisions = salaryRecords.length > 1;

  // 3. Query attendance status counts for reporting
  const attRes = await pool.query<{ status: string; count: string; work: string }>(
    `SELECT status, count(*)::int AS count, COALESCE(SUM(working_minutes), 0)::int AS work
     FROM daily_attendance_records
     WHERE employee_id = $1 AND attendance_date BETWEEN $2::date AND $3::date
     GROUP BY status`,
    [employeeId, fromDate, toDate],
  );

  const counts: Record<string, number> = {};
  let totalWorkMinutes = 0;
  for (const row of attRes.rows) {
    counts[row.status] = Number(row.count ?? 0);
    totalWorkMinutes += Number(row.work ?? 0);
  }

  const present = counts.PRESENT ?? 0;
  const late = counts.LATE ?? 0;
  const earlyExit = counts.EARLY_EXIT ?? 0;
  const lateAndEarlyExit = counts.LATE_AND_EARLY_EXIT ?? 0;
  const halfDay = counts.HALF_DAY ?? 0;
  const weeklyOff = counts.WEEKLY_OFF ?? 0;
  const holiday = counts.HOLIDAY ?? 0;
  const missingPunch = counts.MISSING_PUNCH ?? 0;
  const currentlyCheckedIn = counts.CURRENTLY_CHECKED_IN ?? 0;
  const checkOutMissing = counts.CHECK_OUT_MISSING ?? 0;
  const noShift = counts.NO_SHIFT ?? 0;
  const unmatched = counts.UNMATCHED ?? 0;
  const dbAbsent = counts.ABSENT ?? 0;

  const totalRecorded = present + late + earlyExit + lateAndEarlyExit + halfDay + weeklyOff + holiday + missingPunch + currentlyCheckedIn + checkOutMissing + noShift + unmatched + dbAbsent;

  const joined = emp.joining_date && emp.joining_date > fromDate ? emp.joining_date : fromDate;
  const eligibleCalendarDays = Math.max(
    0,
    Math.floor((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${joined}T00:00:00Z`)) / 86400000) + 1,
  );

  // Calculate shift-punch based payable salary days for the period
  const { presentSalaryDays } = await calculatePayableSalaryDaysForPeriod(employeeId, joined, toDate);
  const derivedAbsent = Math.max(0, eligibleCalendarDays - presentSalaryDays);
  const absentSalaryDays = derivedAbsent;

  const isFullMonth = isFullCalendarMonth(fromDate, toDate);

  let monthlySalary = 0;
  let dailyRate = 0;
  let hourlyRate = 0;
  let dailySalaryRate = 0;
  let absenceDeduction = 0;
  let earnedSalary = 0;

  if (primarySalary && !hasSalaryRevisions) {
    monthlySalary = Number(primarySalary.monthly_salary ?? 0);
    dailyRate = Number(primarySalary.daily_rate ?? 0);
    hourlyRate = Number(primarySalary.hourly_rate ?? 0);

    if (primarySalary.salary_type === "MONTHLY") {
      dailySalaryRate = calculateDailySalaryRate(monthlySalary);
      absenceDeduction = roundMoney(absentSalaryDays * (monthlySalary / FIXED_SALARY_BASIS_DAYS));
      earnedSalary = calculateEarnedSalary(monthlySalary, presentSalaryDays, absentSalaryDays, isFullMonth);
    } else if (primarySalary.salary_type === "DAILY") {
      dailySalaryRate = roundMoney(dailyRate);
      earnedSalary = roundMoney(presentSalaryDays * dailyRate);
    } else if (primarySalary.salary_type === "HOURLY") {
      dailySalaryRate = roundMoney(hourlyRate * 8);
      earnedSalary = roundMoney((totalWorkMinutes / 60) * hourlyRate);
    }
  } else if (hasSalaryRevisions) {
    // If salary revised mid-period, compute per sub-interval
    monthlySalary = Number(primarySalary?.monthly_salary ?? 0);
    dailySalaryRate = calculateDailySalaryRate(monthlySalary);

    let accumulatedEarned = 0;
    let accumulatedAbsenceDeduction = 0;

    for (const sal of salaryRecords) {
      const subStart = sal.effective_from > fromDate ? sal.effective_from : fromDate;
      const subEnd = sal.effective_to && sal.effective_to < toDate ? sal.effective_to : toDate;
      if (subStart > subEnd) continue;

      const subRes = await calculatePayableSalaryDaysForPeriod(employeeId, subStart, subEnd);
      const subPres = subRes.presentSalaryDays;
      const subDays = Math.max(0, Math.floor((Date.parse(`${subEnd}T00:00:00Z`) - Date.parse(`${subStart}T00:00:00Z`)) / 86400000) + 1);
      const subAbs = Math.max(0, subDays - subPres);

      const subMonthly = Number(sal.monthly_salary ?? 0);
      const subDaily = Number(sal.daily_rate ?? 0);
      const subHourly = Number(sal.hourly_rate ?? 0);

      if (sal.salary_type === "MONTHLY") {
        const subRate = subMonthly / FIXED_SALARY_BASIS_DAYS;
        accumulatedAbsenceDeduction += subAbs * subRate;
        accumulatedEarned += subPres * subRate;
      } else if (sal.salary_type === "DAILY") {
        accumulatedEarned += subPres * subDaily;
      } else if (sal.salary_type === "HOURLY") {
        accumulatedEarned += (subRes.totalWorkMinutes / 60) * subHourly;
      }
    }

    absenceDeduction = roundMoney(accumulatedAbsenceDeduction);
    earnedSalary = roundMoney(accumulatedEarned);
  }

  const rawAdvance = await advancesRepo.getBalance(employeeId);
  const advanceBalance = roundMoney(Number(rawAdvance ?? 0));

  const netPayableSalary = roundMoney(Math.max(0, earnedSalary - advanceBalance));

  return {
    employeeId,
    periodStart: fromDate,
    periodEnd: toDate,
    joiningDate: emp.joining_date,
    eligibleCalendarDays,
    isFullMonth,
    salaryRecord: primarySalary
      ? {
          id: primarySalary.id,
          salaryType: primarySalary.salary_type,
          monthlySalary,
          dailyRate,
          hourlyRate,
          effectiveFrom: primarySalary.effective_from,
          effectiveTo: primarySalary.effective_to,
        }
      : null,
    attendanceCounts: {
      present,
      late,
      earlyExit,
      lateAndEarlyExit,
      halfDay,
      absent: derivedAbsent,
      weeklyOff,
      holiday,
      missingPunch,
      currentlyCheckedIn,
      checkOutMissing,
      noShift,
      unmatched,
      totalRecorded,
      totalWorkMinutes,
    },
    presentSalaryDays,
    absentSalaryDays,
    salaryBasisDays: FIXED_SALARY_BASIS_DAYS,
    dailySalaryRate,
    absenceDeduction,
    earnedSalary,
    advanceBalance,
    netPayableSalary,
    hasSalaryRevisions,
  };
}

async function calculatePayableSalaryDaysForPeriod(
  employeeId: string,
  fromDate: string,
  toDate: string,
): Promise<{ presentSalaryDays: number; totalWorkMinutes: number }> {
  const shiftAssRes = await pool.query<{
    effective_from: string;
    effective_to: string | null;
    shift_id: string;
    session_count: number;
  }>(
    `SELECT 
       esa.effective_from::text,
       esa.effective_to::text,
       s.id AS shift_id,
       COALESCE(ss.session_count, 1)::int AS session_count
     FROM employee_shift_assignments esa
     JOIN shifts s ON s.id = esa.shift_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS session_count
       FROM shift_sessions
       WHERE shift_id = s.id AND active = true
     ) ss ON true
     WHERE esa.employee_id = $1
       AND esa.effective_from <= $3::date
       AND (esa.effective_to IS NULL OR esa.effective_to >= $2::date)
     ORDER BY esa.effective_from DESC`,
    [employeeId, fromDate, toDate],
  );

  const attRowsRes = await pool.query<{
    attendance_date: string;
    status: string;
    working_minutes: number;
    raw_punch_count: number;
    first_raw_punch_id: number | null;
    last_raw_punch_id: number | null;
    session_records: any;
  }>(
    `SELECT 
       attendance_date::text,
       status,
       working_minutes,
       raw_punch_count,
       first_raw_punch_id,
       last_raw_punch_id,
       session_records
     FROM daily_attendance_records
     WHERE employee_id = $1 AND attendance_date BETWEEN $2::date AND $3::date`,
    [employeeId, fromDate, toDate],
  );

  const attMap = new Map<string, (typeof attRowsRes.rows)[0]>();
  for (const row of attRowsRes.rows) {
    attMap.set(row.attendance_date, row);
  }

  let presentSalaryDays = 0;
  let totalWorkMinutes = 0;

  const cur = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);

  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    const att = attMap.get(dateStr);
    if (att) {
      totalWorkMinutes += Number(att.working_minutes ?? 0);
    }

    if (att?.status === "WEEKLY_OFF" || att?.status === "HOLIDAY") {
      presentSalaryDays += 1.0;
    } else if (att?.status === "HALF_DAY") {
      presentSalaryDays += 0.5;
    } else if (att?.status === "NO_SHIFT" || att?.status === "UNMATCHED") {
      // 0.0 payable days
    } else {
      const assignment = shiftAssRes.rows.find(
        (a) => a.effective_from <= dateStr && (!a.effective_to || a.effective_to >= dateStr),
      );
      const sessionCount = assignment ? Math.max(1, Number(assignment.session_count ?? 1)) : 1;

      let sessions: any[] = [];
      if (att?.session_records) {
        if (Array.isArray(att.session_records)) {
          sessions = att.session_records;
        } else if (typeof att.session_records === "string") {
          try {
            sessions = JSON.parse(att.session_records);
          } catch {
            sessions = [];
          }
        }
      }

      if (sessionCount >= 2) {
        // Two-shift employee
        const s1 = sessions.find((s: any) => s.session_number === 1) ?? sessions[0];
        const s2 = sessions.find((s: any) => s.session_number === 2) ?? sessions[1];

        const s1HasPunch = Boolean(
          s1 && (s1.punch_in_id != null || s1.punch_out_id != null || s1.punch_in_at != null || s1.punch_out_at != null),
        );
        const s2HasPunch = Boolean(
          s2 && (s2.punch_in_id != null || s2.punch_out_id != null || s2.punch_in_at != null || s2.punch_out_at != null),
        );

        if (s1HasPunch || s2HasPunch) {
          const dayPayable = (s1HasPunch ? 0.5 : 0.0) + (s2HasPunch ? 0.5 : 0.0);
          presentSalaryDays += dayPayable;
        } else {
          // Fallback if session_records punch IDs are not populated
          if (att?.status === "HALF_DAY") {
            presentSalaryDays += 0.5;
          } else if (
            att?.status === "PRESENT" ||
            att?.status === "LATE" ||
            att?.status === "EARLY_EXIT" ||
            att?.status === "LATE_AND_EARLY_EXIT" ||
            att?.status === "MISSING_PUNCH" ||
            att?.status === "CURRENTLY_CHECKED_IN"
          ) {
            presentSalaryDays += 1.0;
          }
        }
      } else {
        // Single-shift employee
        if (att?.status === "HALF_DAY") {
          presentSalaryDays += 0.5;
        } else {
          const hasSessionPunch = sessions.some(
            (s: any) => s.punch_in_id != null || s.punch_out_id != null || s.punch_in_at != null || s.punch_out_at != null,
          );
          const hasRawPunch =
            Number(att?.raw_punch_count ?? 0) > 0 ||
            att?.first_raw_punch_id != null ||
            att?.last_raw_punch_id != null;
          const isPunchedStatus =
            att?.status === "PRESENT" ||
            att?.status === "LATE" ||
            att?.status === "EARLY_EXIT" ||
            att?.status === "LATE_AND_EARLY_EXIT" ||
            att?.status === "MISSING_PUNCH" ||
            att?.status === "CURRENTLY_CHECKED_IN";

          const dayPayable = hasSessionPunch || hasRawPunch || isPunchedStatus ? 1.0 : 0.0;
          presentSalaryDays += dayPayable;
        }
      }
    }

    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return { presentSalaryDays, totalWorkMinutes };
}

