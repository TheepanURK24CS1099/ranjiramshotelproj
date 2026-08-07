/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDatabasePool } from "../../infrastructure/database/database.js";

const pool = getDatabasePool();
const MAX_DAYS = 366;
export type ReportName = "attendance-summary" | "payroll-summary" | "salary-history" | "advances" | "device-logs" | "raw-punches" | "attendance-exceptions" | "unmatched-biometrics";
export type Query = Record<string, unknown>;
type Page<T> = { items: T[]; pagination: { page: number; limit: number; total: number; pages: number }; summary: Record<string, number> };

function date(value: unknown, name: string): string | undefined { if (value === undefined || value === "") return undefined; if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`Validation: ${name} must be YYYY-MM-DD`); return value; }
function paging(q: Query) { const page = Math.max(1, Number(q.page ?? 1) || 1); const limit = Math.min(100, Math.max(1, Number(q.limit ?? 25) || 25)); return { page, limit, offset: (page - 1) * limit }; }
function range(q: Query) { const from = date(q.fromDate, "fromDate"); const to = date(q.toDate, "toDate"); if (from && to && from > to) throw new Error("Validation: fromDate must not be after toDate"); if (from && to && (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > MAX_DAYS) throw new Error("Validation: date range may not exceed 366 days"); return { from, to }; }
function result<T>(items: T[], total: number, q: Query, summary: Record<string, number>): Page<T> { const { page, limit } = paging(q); return { items, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }, summary }; }
function filter(q: Query, clauses: string[], values: unknown[], column: string, key: string) { if (typeof q[key] === "string" && q[key]) { values.push(q[key]); clauses.push(`${column}=$${values.length}`); } }

export async function attendance(q: Query) {
  const { from, to } = range(q); const c: string[] = []; const v: unknown[] = [];
  if (from) { v.push(from); c.push(`a.attendance_date >= $${v.length}::date`); }
  if (to) { v.push(to); c.push(`a.attendance_date <= $${v.length}::date`); }
  filter(q,c,v,"a.employee_id","employeeId");
  filter(q,c,v,"a.biometric_id::text","biometricId");
  filter(q,c,v,"a.shift_id","shiftId");
  filter(q,c,v,"a.status","status");
  filter(q,c,v,"e.department","department");
  filter(q,c,v,"e.designation","designation");
  if (typeof q.active === "string" && q.active !== "") {
    v.push(q.active === "true");
    c.push(`e.active = $${v.length}`);
  }
  c.push(`a.employee_id IS NOT NULL`);

  const where = c.length ? `WHERE ${c.join(" AND ")}` : "";
  const {limit,offset}=paging(q); v.push(limit,offset);

  const sql = `
    SELECT
      e.name AS employee,
      e.name AS employee_name,
      e.id AS employee_id,
      COALESCE(e.employee_code,'—') AS employee_code,
      COALESCE(e.biometric_id::text, '—') AS biometric_id,
      COALESCE(cs.name, MAX(s.name), 'Historical/Unassigned') AS shift,
      CASE WHEN e.active THEN 'Active' WHEN e.active IS FALSE THEN 'Inactive' ELSE '—' END AS active_status,
      COUNT(*)::int AS total_working_days,
      COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE','EARLY_EXIT','LATE_AND_EARLY_EXIT','HALF_DAY') OR a.status='MISSING_PUNCH')::int AS present_days,
      COUNT(*) FILTER (WHERE a.status='ABSENT')::int AS absent_days,
      COUNT(*) FILTER (WHERE a.status IN ('LATE','LATE_AND_EARLY_EXIT'))::int AS late_days,
      COUNT(*) FILTER (WHERE a.status='MISSING_PUNCH' OR a.session_records @> '[{"missing_punch": true}]'::jsonb)::int AS missing_punches,
      COALESCE(SUM(a.working_minutes), 0)::int AS total_worked_minutes,
      ROUND(COALESCE(SUM(a.working_minutes),0)/60.0, 1)::text AS total_worked_hours,
      0::int AS overtime_minutes,
      '0.0'::text AS overtime_hours,
      COALESCE(
        COUNT(*) FILTER (
          WHERE a.status NOT IN ('HOLIDAY', 'WEEKLY_OFF', 'NO_SHIFT')
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(a.session_records) s
              WHERE (s->>'session_number')::int = 1
                AND (s->>'status' IN ('COMPLETED', 'PRESENT', 'LATE', 'EARLY_EXIT', 'LATE_AND_EARLY_EXIT', 'HALF_DAY')
                     OR (s->>'worked_minutes')::int > 0
                     OR (s->>'punch_in_id' IS NOT NULL AND s->>'punch_out_id' IS NOT NULL))
            )
        )::text || ' / ' ||
        COUNT(*) FILTER (
          WHERE a.status NOT IN ('HOLIDAY', 'WEEKLY_OFF', 'NO_SHIFT')
            AND (
              jsonb_array_length(a.session_records) >= 1
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(a.session_records) s
                WHERE (s->>'session_number')::int = 1
              )
            )
        )::text,
        '0 / 0'
      ) AS shift1_summary,
      COALESCE(
        COUNT(*) FILTER (
          WHERE a.status NOT IN ('HOLIDAY', 'WEEKLY_OFF', 'NO_SHIFT')
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(a.session_records) s
              WHERE (s->>'session_number')::int = 2
                AND (s->>'status' IN ('COMPLETED', 'PRESENT', 'LATE', 'EARLY_EXIT', 'LATE_AND_EARLY_EXIT', 'HALF_DAY')
                     OR (s->>'worked_minutes')::int > 0
                     OR (s->>'punch_in_id' IS NOT NULL AND s->>'punch_out_id' IS NOT NULL))
            )
        )::text || ' / ' ||
        COUNT(*) FILTER (
          WHERE a.status NOT IN ('HOLIDAY', 'WEEKLY_OFF', 'NO_SHIFT')
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(a.session_records) s
              WHERE (s->>'session_number')::int = 2
            )
        )::text,
        '0 / 0'
      ) AS shift2_summary,
      'View Report' AS view_report
    FROM daily_attendance_records a
    LEFT JOIN employees e ON e.id = a.employee_id
    LEFT JOIN shifts s ON s.id = a.shift_id
    LEFT JOIN LATERAL (
      SELECT sh.name
      FROM employee_shift_assignments esa
      JOIN shifts sh ON sh.id = esa.shift_id
      WHERE esa.employee_id = e.id AND esa.effective_to IS NULL
      ORDER BY esa.effective_from DESC
      LIMIT 1
    ) cs ON true
    ${where}
    GROUP BY e.id, e.name, e.employee_code, e.active, e.biometric_id, cs.name
    ORDER BY e.name NULLS LAST, e.biometric_id
    LIMIT $${v.length-1} OFFSET $${v.length}
  `;

  const countQuery = `
    SELECT COUNT(DISTINCT a.employee_id)::int AS total
    FROM daily_attendance_records a
    LEFT JOIN employees e ON e.id = a.employee_id
    ${where}
  `;

  const summaryQuery = `
    SELECT
      COUNT(DISTINCT a.employee_id)::int AS total_employees,
      COUNT(DISTINCT a.employee_id) FILTER (WHERE e.active)::int AS active_employees,
      COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'EARLY_EXIT', 'LATE_AND_EARLY_EXIT', 'HALF_DAY') OR a.status = 'MISSING_PUNCH')::int AS present,
      COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent,
      COUNT(*) FILTER (WHERE a.status IN ('LATE', 'LATE_AND_EARLY_EXIT'))::int AS late,
      COUNT(*) FILTER (WHERE a.status = 'MISSING_PUNCH' OR a.session_records @> '[{"missing_punch": true}]'::jsonb)::int AS missing_punches
    FROM daily_attendance_records a
    LEFT JOIN employees e ON e.id = a.employee_id
    ${where}
  `;

  const cUnmatched: string[] = [];
  const vUnmatched: unknown[] = [];
  if (from) { vUnmatched.push(from); cUnmatched.push(`a.attendance_date >= $${vUnmatched.length}::date`); }
  if (to) { vUnmatched.push(to); cUnmatched.push(`a.attendance_date <= $${vUnmatched.length}::date`); }
  filter(q, cUnmatched, vUnmatched, "a.biometric_id::text", "biometricId");
  filter(q, cUnmatched, vUnmatched, "a.shift_id", "shiftId");
  filter(q, cUnmatched, vUnmatched, "a.status", "status");
  cUnmatched.push(`a.employee_id IS NULL`);

  const whereUnmatched = cUnmatched.length ? `WHERE ${cUnmatched.join(" AND ")}` : "";
  const unmatchedQuery = `
    SELECT COUNT(DISTINCT a.biometric_id)::int AS historical_unmatched_ids
    FROM daily_attendance_records a
    ${whereUnmatched}
  `;

  const [rows, count, summaryResult, unmatchedResult] = await Promise.all([
    pool.query(sql, v),
    pool.query<{total: string}>(countQuery, v.slice(0, -2)),
    pool.query(summaryQuery, v.slice(0, -2)),
    pool.query(unmatchedQuery, vUnmatched)
  ]);

  const sData = summaryResult.rows[0] || {
    total_employees: 0,
    active_employees: 0,
    present: 0,
    absent: 0,
    late: 0,
    missing_punches: 0
  };

  const summary = {
    totalEmployees: sData.total_employees,
    activeEmployees: sData.active_employees,
    present: sData.present,
    absent: sData.absent,
    late: sData.late,
    missingPunches: sData.missing_punches,
    historicalUnmatchedIds: unmatchedResult.rows[0]?.historical_unmatched_ids || 0
  };

  return result(rows.rows, Number(count.rows[0]?.total ?? 0), q, summary);
}

function deriveSessionStatusString(dayStatus: string, s?: Record<string, any>): string {
  if (!s) {
    if (dayStatus === 'HOLIDAY') return 'Holiday';
    if (dayStatus === 'WEEKLY_OFF') return 'Weekly Off';
    if (dayStatus === 'ABSENT') return 'Absent';
    if (dayStatus === 'PRESENT') return 'Present';
    return '—';
  }
  const st = String(s.status || '');
  if (dayStatus === 'HOLIDAY') return 'Holiday';
  if (dayStatus === 'WEEKLY_OFF') return 'Weekly Off';
  if (st === 'MISSING_IN' || st === 'CHECK_IN_MISSING' || (s.missing_punch && !s.punch_in_id)) return 'Check-in Missing';
  if (st === 'MISSING_OUT' || (s.missing_punch && !s.punch_out_id)) return 'Check-out Missing';
  if (st === 'LATE_AND_EARLY_EXIT') return 'Late & Early Exit';
  if (st === 'LATE' || Number(s.late_minutes || 0) > 0) return 'Late';
  if (st === 'EARLY_EXIT' || Number(s.early_exit_minutes || 0) > 0) return 'Early Exit';
  if (st === 'HALF_DAY') return 'Half Day';
  if (st === 'COMPLETED' || st === 'PRESENT' || Number(s.worked_minutes || 0) > 0) return 'Present';
  if (dayStatus === 'ABSENT' || st === 'ABSENT') return 'Absent';
  if (st === 'PENDING') return 'Pending';
  if (st === 'NOT_STARTED') return 'Not Started';
  return st ? st.replaceAll('_', ' ') : '—';
}

export async function employeeAttendanceDetail(employeeId: string, q: Query) {
  if (!employeeId || typeof employeeId !== "string") throw new Error("Validation: employeeId is required");
  const { from, to } = range(q);

  const empRow = await pool.query(
    `SELECT e.id, e.name, COALESCE(e.employee_code,'—') AS employee_code,
       e.biometric_id::text AS biometric_id, e.active,
       COALESCE(s.name,'Unassigned') AS current_shift
     FROM employees e
     LEFT JOIN employee_shift_assignments esa ON esa.employee_id = e.id AND esa.effective_to IS NULL
     LEFT JOIN shifts s ON s.id = esa.shift_id
     WHERE e.id = $1`,
    [employeeId],
  );
  if (!empRow.rows[0]) throw new Error("Not Found: employee");
  const emp = empRow.rows[0] as Record<string, unknown>;

  const c: string[] = ["a.employee_id = $1"];
  const v: unknown[] = [employeeId];
  if (from) { v.push(from); c.push(`a.attendance_date >= $${v.length}::date`); }
  if (to) { v.push(to); c.push(`a.attendance_date <= $${v.length}::date`); }
  const where = `WHERE ${c.join(" AND ")}`;

  const allRecordsRes = await pool.query(
    `SELECT a.status, a.session_records
     FROM daily_attendance_records a
     ${where}`,
    v,
  );

  const shift1Summary = { completed: 0, expected: 0, present: 0, late: 0, earlyExit: 0, absent: 0, halfDay: 0, checkinMissing: 0, checkoutMissing: 0, pending: 0 };
  const shift2Summary = { completed: 0, expected: 0, present: 0, late: 0, earlyExit: 0, absent: 0, halfDay: 0, checkinMissing: 0, checkoutMissing: 0, pending: 0 };

  for (const rec of allRecordsRes.rows) {
    const dayStatus = String(rec.status || '');
    const sessions = Array.isArray(rec.session_records) ? rec.session_records : [];
    const isWorkingDay = !['HOLIDAY', 'WEEKLY_OFF', 'NO_SHIFT'].includes(dayStatus);

    const s1 = sessions.find((x: any) => Number(x.session_number) === 1);
    const s2 = sessions.find((x: any) => Number(x.session_number) === 2);

    if (isWorkingDay && s1) {
      shift1Summary.expected += 1;
      const s1Label = deriveSessionStatusString(dayStatus, s1);
      if (s1Label === 'Present') { shift1Summary.present += 1; shift1Summary.completed += 1; }
      else if (s1Label === 'Late' || s1Label === 'Late & Early Exit') { shift1Summary.late += 1; shift1Summary.completed += 1; }
      else if (s1Label === 'Early Exit') { shift1Summary.earlyExit += 1; shift1Summary.completed += 1; }
      else if (s1Label === 'Half Day') { shift1Summary.halfDay += 1; shift1Summary.completed += 1; }
      else if (s1Label === 'Check-in Missing') { shift1Summary.checkinMissing += 1; }
      else if (s1Label === 'Check-out Missing') { shift1Summary.checkoutMissing += 1; }
      else if (s1Label === 'Pending') { shift1Summary.pending += 1; }
      else if (s1Label === 'Absent') { shift1Summary.absent += 1; }
    }

    if (isWorkingDay && s2) {
      shift2Summary.expected += 1;
      const s2Label = deriveSessionStatusString(dayStatus, s2);
      if (s2Label === 'Present') { shift2Summary.present += 1; shift2Summary.completed += 1; }
      else if (s2Label === 'Late' || s2Label === 'Late & Early Exit') { shift2Summary.late += 1; shift2Summary.completed += 1; }
      else if (s2Label === 'Early Exit') { shift2Summary.earlyExit += 1; shift2Summary.completed += 1; }
      else if (s2Label === 'Half Day') { shift2Summary.halfDay += 1; shift2Summary.completed += 1; }
      else if (s2Label === 'Check-in Missing') { shift2Summary.checkinMissing += 1; }
      else if (s2Label === 'Check-out Missing') { shift2Summary.checkoutMissing += 1; }
      else if (s2Label === 'Pending') { shift2Summary.pending += 1; }
      else if (s2Label === 'Absent') { shift2Summary.absent += 1; }
    }
  }

  const { limit, offset } = paging(q);
  const paginatedV = [...v, limit, offset];

  const sql = `
    SELECT
      a.attendance_date::text AS date,
      COALESCE(s.name, 'Unassigned') AS shift,
      to_char(a.punch_in_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS first_punch_in,
      to_char(a.punch_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS last_punch_out,
      CASE
        WHEN a.working_minutes > 0
        THEN LPAD((a.working_minutes/60)::text,2,'0') || ':' || LPAD((a.working_minutes%60)::text,2,'0')
        ELSE '—'
      END AS worked_duration,
      a.status AS attendance_status,
      a.session_records,
      COALESCE(a.note, '—') AS notes,
      COALESCE(a.note, '—') AS remarks
    FROM daily_attendance_records a
    LEFT JOIN shifts s ON s.id = a.shift_id
    ${where}
    ORDER BY a.attendance_date DESC
    LIMIT $${paginatedV.length - 1} OFFSET $${paginatedV.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total FROM daily_attendance_records a ${where}
  `;

  const summarySql = `
    SELECT
      COUNT(*)::int AS total_working_days,
      COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE','EARLY_EXIT','LATE_AND_EARLY_EXIT','HALF_DAY') OR a.status = 'MISSING_PUNCH')::int AS present_days,
      COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent_days,
      COUNT(*) FILTER (WHERE a.status IN ('LATE','LATE_AND_EARLY_EXIT'))::int AS late_days,
      COUNT(*) FILTER (WHERE a.status IN ('EARLY_EXIT','LATE_AND_EARLY_EXIT'))::int AS early_exits,
      COUNT(*) FILTER (WHERE a.status = 'HOLIDAY')::int AS holidays,
      COUNT(*) FILTER (WHERE a.status = 'WEEKLY_OFF')::int AS weekly_offs,
      COUNT(*) FILTER (WHERE a.status = 'MISSING_PUNCH' OR a.session_records @> '[{"missing_punch": true}]'::jsonb)::int AS missing_punches,
      ROUND(COALESCE(SUM(a.working_minutes),0)/60.0, 1)::text AS total_worked_hours
    FROM daily_attendance_records a
    ${where}
  `;

  const [rows, countRes, summaryRes] = await Promise.all([
    pool.query(sql, paginatedV),
    pool.query<{ total: number }>(countSql, v),
    pool.query(summarySql, v),
  ]);

  const s = summaryRes.rows[0] ?? {};
  const summary = {
    totalWorkingDays: Number(s.total_working_days ?? 0),
    presentDays: Number(s.present_days ?? 0),
    absentDays: Number(s.absent_days ?? 0),
    shift1: `${shift1Summary.completed} / ${shift1Summary.expected}`,
    shift2: `${shift2Summary.completed} / ${shift2Summary.expected}`,
    shift1Summary,
    shift2Summary,
  };

  const employee = {
    id: emp.id,
    name: emp.name,
    employee_code: emp.employee_code,
    biometric_id: emp.biometric_id,
    active: emp.active,
    current_shift: emp.current_shift,
  };

  const items = rows.rows.map((r: any) => {
    const dayStatus = String(r.attendance_status || '');
    const sessions = Array.isArray(r.session_records) ? r.session_records : [];
    const s1 = sessions.find((x: any) => Number(x.session_number) === 1);
    const s2 = sessions.find((x: any) => Number(x.session_number) === 2);

    return {
      date: r.date,
      shift: r.shift,
      shift1_status: deriveSessionStatusString(dayStatus, s1),
      shift2_status: deriveSessionStatusString(dayStatus, s2),
      worked_duration: r.worked_duration,
      notes: r.notes,
      remarks: r.remarks,
    };
  });

  return { ...result(items, Number(countRes.rows[0]?.total ?? 0), q, {}), summary, employee };
}

export async function payroll(q: Query) { const c:string[]=[]; const v:unknown[]=[]; filter(q,c,v,"p.year","year"); filter(q,c,v,"p.month","month"); filter(q,c,v,"p.id","periodId"); filter(q,c,v,"r.employee_id","employeeId"); filter(q,c,v,"r.status","status"); const where=c.length?`WHERE ${c.join(" AND ")}`:""; const {limit,offset}=paging(q); v.push(limit,offset); const sql=`SELECT e.name employee,r.employee_id,e.biometric_id::text biometric_id,r.salary_type,r.base_salary::text,r.gross_pay::text gross_salary,r.attendance_deduction::text,r.advance_recovery::text,r.other_deductions::text manual_deductions,(r.gross_pay-r.base_salary)::text additions,r.net_pay::text net_salary,r.status payroll_status,p.status period_status,pp.payment_method,pp.payment_date::text,pp.payment_reference FROM employee_payroll_records r JOIN payroll_periods p ON p.id=r.payroll_period_id JOIN employees e ON e.id=r.employee_id LEFT JOIN payroll_payments pp ON pp.payroll_record_id=r.id AND pp.status='PAID' ${where} ORDER BY p.year DESC,p.month DESC,e.name LIMIT $${v.length-1} OFFSET $${v.length}`; const [rows,count]=await Promise.all([pool.query(sql,v),pool.query<{total:string}>(`SELECT COUNT(*) total FROM employee_payroll_records r JOIN payroll_periods p ON p.id=r.payroll_period_id ${where}`,v.slice(0,-2))]); const summary=rows.rows.reduce((x:any,r:any)=>({employeeCount:x.employeeCount+1,grossTotal:x.grossTotal+Number(r.gross_salary),deductionTotal:x.deductionTotal+Number(r.attendance_deduction)+Number(r.manual_deductions),advanceRecoveryTotal:x.advanceRecoveryTotal+Number(r.advance_recovery),netTotal:x.netTotal+Number(r.net_salary),paidTotal:x.paidTotal+(r.payroll_status==='PAID'?Number(r.net_salary):0),pendingTotal:x.pendingTotal+(r.payroll_status==='PAID'?0:Number(r.net_salary))}),{employeeCount:0,grossTotal:0,deductionTotal:0,advanceRecoveryTotal:0,netTotal:0,paidTotal:0,pendingTotal:0}); return result(rows.rows,Number(count.rows[0]?.total??0),q,summary); }

export async function salary(q: Query) { const {from,to}=range(q); const c:string[]=[];const v:unknown[]=[];filter(q,c,v,"s.employee_id","employeeId");filter(q,c,v,"s.salary_type","salaryType");if(q.activeOnly==='true'){c.push("s.active=true");}if(from){v.push(from);c.push(`COALESCE(s.effective_to,'infinity') >= $${v.length}::date`);}if(to){v.push(to);c.push(`s.effective_from <= $${v.length}::date`);}const where=c.length?`WHERE ${c.join(' AND ')}`:"";const{limit,offset}=paging(q);v.push(limit,offset);const sql=`SELECT e.name employee,s.employee_id,s.salary_type,COALESCE(s.monthly_salary,s.daily_rate,s.hourly_rate)::text amount,s.effective_from::text,s.effective_to::text,s.active,s.created_at FROM employee_salary_history s JOIN employees e ON e.id=s.employee_id ${where} ORDER BY s.effective_from DESC LIMIT $${v.length-1} OFFSET $${v.length}`;const [rows,count]=await Promise.all([pool.query(sql,v),pool.query<{total:string}>(`SELECT COUNT(*) total FROM employee_salary_history s ${where}`,v.slice(0,-2))]);return result(rows.rows,Number(count.rows[0]?.total??0),q,{}); }

export async function advances(q: Query) { const {from,to}=range(q);const c:string[]=[];const v:unknown[]=[];filter(q,c,v,"a.employee_id","employeeId");filter(q,c,v,"a.transaction_type","status");if(from){v.push(from);c.push(`a.transaction_date >= $${v.length}::date`)}if(to){v.push(to);c.push(`a.transaction_date <= $${v.length}::date`)}const where=c.length?`WHERE ${c.join(' AND ')}`:"";const{limit,offset}=paging(q);v.push(limit,offset);const sql=`SELECT e.name employee,a.employee_id,a.id,a.transaction_type status,a.amount::text advance_amount,a.transaction_date::text,a.notes,a.payroll_record_id,CASE WHEN a.transaction_type='REPAYMENT' THEN a.amount ELSE 0 END::text recovered_amount,SUM(CASE WHEN a.transaction_type IN ('OPENING_ADVANCE','ADVANCE_GIVEN','ADJUSTMENT') THEN a.amount ELSE -a.amount END) OVER(PARTITION BY a.employee_id ORDER BY a.transaction_date,a.created_at)::text outstanding_balance FROM employee_advance_transactions a JOIN employees e ON e.id=a.employee_id ${where} ORDER BY a.transaction_date DESC,a.created_at DESC LIMIT $${v.length-1} OFFSET $${v.length}`;const [rows,count]=await Promise.all([pool.query(sql,v),pool.query<{total:string}>(`SELECT COUNT(*) total FROM employee_advance_transactions a ${where}`,v.slice(0,-2))]);const summary=rows.rows.reduce((x:any,r:any)=>({totalAdvanced:x.totalAdvanced+(['OPENING_ADVANCE','ADVANCE_GIVEN'].includes(r.status)?Number(r.advance_amount):0),totalRecovered:x.totalRecovered+Number(r.recovered_amount),outstandingBalance:Number(r.outstanding_balance)}),{totalAdvanced:0,totalRecovered:0,outstandingBalance:0});return result(rows.rows,Number(count.rows[0]?.total??0),q,summary); }

export async function devices(q: Query) { const {from,to}=range(q);const c:string[]=[];const v:unknown[]=[];filter(q,c,v,"d.id","deviceId"); if(from){v.push(from);c.push(`p.punch_time >= $${v.length}::date`)}if(to){v.push(to);c.push(`p.punch_time < ($${v.length}::date + interval '1 day')`)}const where=c.length?`WHERE ${c.join(' AND ')}`:"";const{limit,offset}=paging(q);v.push(limit,offset);const sql=`SELECT d.id,d.name,d.model,d.serial_number,d.device_code,d.status,d.last_seen,d.last_ip::text,MAX(p.received_at) last_sync,COUNT(p.id)::int punch_count,COUNT(p.id) FILTER(WHERE p.ignored)::int ignored_punches FROM devices d LEFT JOIN raw_attendance_punches p ON p.device_id=d.id ${where} GROUP BY d.id ORDER BY d.name,d.device_code LIMIT $${v.length-1} OFFSET $${v.length}`;const [rows,count]=await Promise.all([pool.query(sql,v),pool.query<{total:string}>(`SELECT COUNT(DISTINCT d.id) total FROM devices d LEFT JOIN raw_attendance_punches p ON p.device_id=d.id ${where}`,v.slice(0,-2))]);const summary=rows.rows.reduce((x:any,r:any)=>({onlineDevices:x.onlineDevices+(r.status==='ONLINE'?1:0),offlineDevices:x.offlineDevices+(r.status==='OFFLINE'?1:0),totalPunches:x.totalPunches+Number(r.punch_count),ignoredPunches:x.ignoredPunches+Number(r.ignored_punches),failedUnprocessedPunches:x.failedUnprocessedPunches}),{onlineDevices:0,offlineDevices:0,totalPunches:0,ignoredPunches:0,failedUnprocessedPunches:0});return result(rows.rows,Number(count.rows[0]?.total??0),q,summary); }

export async function punches(q: Query) { const {from,to}=range(q);const c:string[]=[];const v:unknown[]=[];filter(q,c,v,"p.device_id","deviceId");filter(q,c,v,"p.biometric_id::text","biometricId");filter(q,c,v,"e.id","employeeId"); if(typeof q.ignored==='string'){v.push(q.ignored==='true');c.push(`p.ignored=$${v.length}`)}if(typeof q.processed==='string'){c.push(q.processed==='true'?"(a.first_raw_punch_id=p.id OR a.last_raw_punch_id=p.id)":"COALESCE(a.first_raw_punch_id=p.id OR a.last_raw_punch_id=p.id,false)=false")}if(from){v.push(from);c.push(`p.punch_time >= $${v.length}::date`)}if(to){v.push(to);c.push(`p.punch_time < ($${v.length}::date + interval '1 day')`)}const where=c.length?`WHERE ${c.join(' AND ')}`:"";const{limit,offset}=paging(q);v.push(limit,offset);const sql=`SELECT p.id,p.biometric_id::text biometric_id,COALESCE(e.name,'Unmatched') employee,COALESCE(e.employee_code,'—') employee_code,COALESCE(d.name,d.device_code) device,to_char(p.punch_time AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') punch_timestamp_ist,p.source_event_key,p.ignored,CASE WHEN a.first_raw_punch_id=p.id OR a.last_raw_punch_id=p.id THEN true ELSE false END processed,false duplicate_status,CASE WHEN a.unmatched_raw_punch_id=p.id THEN 'UNMATCHED' END failure_reason FROM raw_attendance_punches p LEFT JOIN devices d ON d.id=p.device_id LEFT JOIN employees e ON e.biometric_id=p.biometric_id LEFT JOIN daily_attendance_records a ON p.id IN(a.first_raw_punch_id,a.last_raw_punch_id,a.unmatched_raw_punch_id) ${where} ORDER BY p.punch_time DESC LIMIT $${v.length-1} OFFSET $${v.length}`;const [rows,count]=await Promise.all([pool.query(sql,v),pool.query<{total:string}>(`SELECT COUNT(*) total FROM raw_attendance_punches p LEFT JOIN employees e ON e.biometric_id=p.biometric_id LEFT JOIN daily_attendance_records a ON p.id IN(a.first_raw_punch_id,a.last_raw_punch_id,a.unmatched_raw_punch_id) ${where}`,v.slice(0,-2))]);return result(rows.rows,Number(count.rows[0]?.total??0),q,{}); }

export async function exceptions(q: Query) { const {from,to}=range(q);const c:string[]=[];const v:unknown[]=[];filter(q,c,v,"x.employee_id","employeeId");filter(q,c,v,"x.exception_type","exceptionType");if(typeof q.resolved==='string'){c.push(q.resolved==='true'?"x.resolved_at IS NOT NULL":"x.resolved_at IS NULL")}if(from){v.push(from);c.push(`x.attendance_date >= $${v.length}::date`)}if(to){v.push(to);c.push(`x.attendance_date <= $${v.length}::date`)}const where=c.length?`WHERE ${c.join(' AND ')}`:"";const{limit,offset}=paging(q);v.push(limit,offset);const sql=`SELECT e.name employee,x.employee_id,x.attendance_date::text date,x.exception_type,x.message description,CASE WHEN x.resolved_at IS NULL THEN 'UNRESOLVED' ELSE 'RESOLVED' END status,COALESCE(u.username,u.email) resolved_by,x.resolved_at,x.resolution_notes FROM attendance_exceptions x JOIN employees e ON e.id=x.employee_id LEFT JOIN app_users u ON u.id=x.resolved_by ${where} ORDER BY x.attendance_date DESC LIMIT $${v.length-1} OFFSET $${v.length}`;const [rows,count]=await Promise.all([pool.query(sql,v),pool.query<{total:string}>(`SELECT COUNT(*) total FROM attendance_exceptions x ${where}`,v.slice(0,-2))]);return result(rows.rows,Number(count.rows[0]?.total??0),q,{}); }

export async function unmatchedBiometrics(q: Query) {
  const { from, to } = range(q);
  const c: string[] = ["a.employee_id IS NULL"];
  const v: unknown[] = [];
  if (from) { v.push(from); c.push(`a.attendance_date >= $${v.length}::date`); }
  if (to) { v.push(to); c.push(`a.attendance_date <= $${v.length}::date`); }
  filter(q, c, v, "a.biometric_id::text", "biometricId");
  filter(q, c, v, "a.shift_id", "shiftId");
  filter(q, c, v, "a.status", "status");

  const where = `WHERE ${c.join(" AND ")}`;
  const { limit, offset } = paging(q);
  v.push(limit, offset);

  const sql = `
    SELECT
      a.biometric_id::text AS biometric_id,
      COALESCE(MAX(d.name), 'Unknown Device') AS device_name,
      to_char(MIN(a.attendance_date), 'YYYY-MM-DD') AS first_seen,
      to_char(MAX(a.attendance_date), 'YYYY-MM-DD') AS last_seen,
      COUNT(*)::int AS total_records
    FROM daily_attendance_records a
    LEFT JOIN raw_attendance_punches p ON p.id = a.first_raw_punch_id
    LEFT JOIN devices d ON d.id = p.device_id
    ${where}
    GROUP BY a.biometric_id
    ORDER BY a.biometric_id
    LIMIT $${v.length - 1} OFFSET $${v.length}
  `;

  const countQuery = `
    SELECT COUNT(DISTINCT a.biometric_id)::int AS total
    FROM daily_attendance_records a
    ${where}
  `;

  const [rows, countRes] = await Promise.all([
    pool.query(sql, v),
    pool.query<{ total: number }>(countQuery, v.slice(0, -2)),
  ]);

  return result(rows.rows, Number(countRes.rows[0]?.total ?? 0), q, {});
}

export async function report(name: ReportName, q: Query) {
  switch (name) {
    case "attendance-summary":
      return attendance(q);
    case "payroll-summary":
      return payroll(q);
    case "salary-history":
      return salary(q);
    case "advances":
      return advances(q);
    case "device-logs":
      return devices(q);
    case "raw-punches":
      return punches(q);
    case "attendance-exceptions":
      return exceptions(q);
    case "unmatched-biometrics":
      return unmatchedBiometrics(q);
    default:
      throw new Error("Validation: Invalid report name");
  }
}
