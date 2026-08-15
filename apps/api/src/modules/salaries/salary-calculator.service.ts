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

  // 3. Query attendance records in full date range
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

  // Present Salary Days: Present, Late, Early Exit, Late&Early Exit, Missing Punch, Checked-in, Checkout-missing, Weekly Off, Holiday = 1.0; Half Day = 0.5
  const presentSalaryDays = present + late + earlyExit + lateAndEarlyExit + missingPunch + currentlyCheckedIn + checkOutMissing + weeklyOff + holiday + (halfDay * 0.5);
  const derivedAbsent = Math.max(dbAbsent + (halfDay * 0.5), Math.max(0, eligibleCalendarDays - presentSalaryDays));
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

      const subAtt = await pool.query<{ status: string; count: string; work: string }>(
        `SELECT status, count(*)::int AS count, COALESCE(SUM(working_minutes), 0)::int AS work
         FROM daily_attendance_records
         WHERE employee_id = $1 AND attendance_date BETWEEN $2::date AND $3::date
         GROUP BY status`,
        [employeeId, subStart, subEnd],
      );

      const subCounts: Record<string, number> = {};
      let subWorkMins = 0;
      for (const r of subAtt.rows) {
        subCounts[r.status] = Number(r.count ?? 0);
        subWorkMins += Number(r.work ?? 0);
      }

      const subPres = (subCounts.PRESENT ?? 0) + (subCounts.LATE ?? 0) + (subCounts.EARLY_EXIT ?? 0) + (subCounts.LATE_AND_EARLY_EXIT ?? 0) + (subCounts.MISSING_PUNCH ?? 0) + (subCounts.CURRENTLY_CHECKED_IN ?? 0) + (subCounts.CHECK_OUT_MISSING ?? 0) + (subCounts.WEEKLY_OFF ?? 0) + (subCounts.HOLIDAY ?? 0) + ((subCounts.HALF_DAY ?? 0) * 0.5);
      const subRecorded = Object.values(subCounts).reduce((a, b) => a + b, 0);
      const subDays = Math.max(0, Math.floor((Date.parse(`${subEnd}T00:00:00Z`) - Date.parse(`${subStart}T00:00:00Z`)) / 86400000) + 1);
      const subAbs = Math.max(subCounts.ABSENT ?? 0, Math.max(0, subDays - subRecorded));

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
        accumulatedEarned += (subWorkMins / 60) * subHourly;
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
