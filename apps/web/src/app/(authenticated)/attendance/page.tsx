"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { formatAttendanceDate, formatTimeOnly, formatWorkingMinutes } from "@/lib/format";
import { ConfirmationModal } from "@/components/confirmation-modal";

type AttendanceStatus = "PRESENT" | "CURRENTLY_CHECKED_IN" | "MISSING_PUNCH" | "UNMATCHED" | "NO_SHIFT" | "LATE" | "EARLY_EXIT" | "LATE_AND_EARLY_EXIT" | "HALF_DAY" | "ABSENT" | "PENDING" | "CHECK_IN_MISSING" | "WEEKLY_OFF" | "HOLIDAY";

type SessionRecord = {
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
  status: string;
};

type AttendanceRow = {
  attendance_key: string;
  attendance_date: string;
  biometric_id: number;
  employee_id: string | null;
  employee_name: string | null;
  employee_code: string;
  shift_id: string | null;
  shift_name: string | null;
  punch_in_at: string | null;
  punch_out_at: string | null;
  working_minutes: number;
  raw_punch_count: number;
  late_minutes: number;
  early_exit_minutes: number;
  note: string | null;
  status: AttendanceStatus;
  session_records?: SessionRecord[];
};

type AttendanceException = {
  raw_punch_id: number;
  employee_name: string;
  biometric_id: number;
  shift_name: string;
  punch_time: string;
  exception_type: "OUT_OF_SHIFT";
  message: string;
};

type EmployeeOption = { id: string; name: string; biometric_id: number };
type ShiftOption = { id: string; name: string };

const istToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

const statusOptions: Array<{ value: AttendanceStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "PRESENT", label: "Present" },
  { value: "MISSING_PUNCH", label: "Missing punch" },
  { value: "UNMATCHED", label: "Unmatched" },
  { value: "NO_SHIFT", label: "No shift" },
];

export default function AttendancePage() {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [exceptions, setExceptions] = useState<AttendanceException[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [date, setDate] = useState(istToday);
  const [employeeId, setEmployeeId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [status, setStatus] = useState<AttendanceStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedExceptions, setSelectedExceptions] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<"delete" | "clear" | "rebuild" | null>(null);
  const [exceptionAction, setExceptionAction] = useState<"resolve" | "delete" | "clear-today" | "clear-date" | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get("/employees?page=1&limit=1000&active=true"),
      apiClient.get("/shifts?active=true"),
    ])
      .then(([employeeResponse, shiftResponse]) => {
        setEmployees((employeeResponse.data as Array<{ id: string; name: string; biometric_id: number }>) ?? []);
        setShifts((shiftResponse as Array<{ id: string; name: string }>) ?? []);
      })
      .catch(() => setError("Failed to load attendance filters"));
    void apiClient.get("/auth/me").then((user) => setRole(String((user as { role: string }).role)));
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ date });
    if (employeeId) params.set("employeeId", employeeId);
    if (shiftId) params.set("shiftId", shiftId);
    if (status) params.set("status", status);
    return params.toString();
  }, [date, employeeId, shiftId, status]);

  useEffect(() => {
    const loadAttendance = async () => {
      setLoading(true);
      setError("");
      try {
        const [data, exceptionData] = await Promise.all([
          apiClient.get(`/attendance?${query}`),
          apiClient.get(`/attendance/exceptions?date=${encodeURIComponent(date)}`),
        ]);
        setRows(data as AttendanceRow[]);
        setSelected([]);
        setExceptions(exceptionData as AttendanceException[]);
        setSelectedExceptions([]);
      } catch {
        setError("Failed to load attendance records");
      } finally {
        setLoading(false);
      }
    };

    void loadAttendance();
  }, [query, date]);

  // Derived Summary Metrics from loaded records
  const metrics = useMemo(() => {
    let presentCount = 0;
    let checkedInCount = 0;
    let missingPunchCount = 0;
    let lateCount = 0;
    let earlyExitCount = 0;

    for (const row of rows) {
      if (row.status === "PRESENT") presentCount++;
      if (row.status === "CURRENTLY_CHECKED_IN") checkedInCount++;
      if (row.status === "MISSING_PUNCH") missingPunchCount++;
      if (row.late_minutes > 0) lateCount++;
      if (row.early_exit_minutes > 0) earlyExitCount++;
    }

    return {
      total: rows.length,
      present: presentCount,
      checkedIn: checkedInCount,
      missingPunch: missingPunchCount,
      late: lateCount,
      earlyExit: earlyExitCount,
      exceptionsCount: exceptions.length,
    };
  }, [rows, exceptions]);

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.attendance_key));
  const allExceptionsSelected =
    exceptions.length > 0 && exceptions.every((exception) => selectedExceptions.includes(exception.raw_punch_id));

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const toggleException = (id: number) =>
    setSelectedExceptions((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const resetFilters = () => {
    setDate(istToday);
    setEmployeeId("");
    setShiftId("");
    setStatus("");
  };

  const run = async () => {
    if (!confirm) return;
    setWorking(true);
    try {
      if (confirm === "delete") {
        await apiClient.delete("/attendance/records", {
          body: JSON.stringify({ ids: selected }),
          headers: { "Content-Type": "application/json" },
        });
      } else if (confirm === "clear") {
        await apiClient.post("/attendance/records/clear-date", { date });
      } else {
        await apiClient.post("/attendance/rebuild", { date });
      }

      setMessage(
        confirm === "rebuild"
          ? "Attendance rebuilt from existing raw punches."
          : "Attendance records updated. Raw biometric punches were preserved."
      );
      const data = await apiClient.get(`/attendance?${query}`);
      setRows(data as AttendanceRow[]);
      setSelected([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
      setConfirm(null);
    }
  };

  const runExceptionAction = async () => {
    if (!exceptionAction) return;
    setWorking(true);
    setError("");
    try {
      const targetDate = exceptionAction === "clear-today" ? istToday : date;
      const targetExceptions =
        exceptionAction === "clear-today" || exceptionAction === "clear-date"
          ? ((await apiClient.get(
              `/attendance/exceptions?date=${encodeURIComponent(targetDate)}`
            )) as AttendanceException[])
          : exceptions;

      const ids =
        exceptionAction === "clear-today" || exceptionAction === "clear-date"
          ? targetExceptions.map((exception) => exception.raw_punch_id)
          : selectedExceptions;

      if (!ids.length) {
        setMessage("No attendance exceptions found for that date.");
        return;
      }

      let completed: number;
      if (exceptionAction === "resolve") {
        const result = (await apiClient.patch("/attendance/exceptions/resolve", { ids })) as { resolved?: number };
        completed = result.resolved ?? 0;
      } else {
        const result = (await apiClient.delete("/attendance/exceptions", {
          body: JSON.stringify({ ids }),
          headers: { "Content-Type": "application/json" },
        })) as { deleted?: number };
        completed = result.deleted ?? 0;
      }

      const label = exceptionAction === "resolve" ? "resolved" : "deleted";
      setMessage(
        `${completed} of ${ids.length} exception${ids.length === 1 ? "" : "s"} ${label}${
          completed === ids.length
            ? "."
            : `; ${ids.length - completed} skipped because they are protected.`
        }`
      );

      const [attendanceData, exceptionData] = await Promise.all([
        apiClient.get(`/attendance?${query}`),
        apiClient.get(`/attendance/exceptions?date=${encodeURIComponent(date)}`),
      ]);
      setRows(attendanceData as AttendanceRow[]);
      setExceptions(exceptionData as AttendanceException[]);
      setSelectedExceptions([]);
    } catch (e) {
      setError((e as Error).message || "Unable to update attendance exceptions");
    } finally {
      setWorking(false);
      setExceptionAction(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Page Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Attendance Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Daily attendance records derived from biometric hardware terminal punches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Selected Date: {formatAttendanceDate(date)}
          </span>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 flex items-center gap-3" role="alert">
          <svg className="h-5 w-5 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 flex items-center gap-3" role="status">
          <svg className="h-5 w-5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{message}</span>
        </div>
      )}

      {/* Attendance Summary Metrics Cards */}
      <section aria-label="Attendance summary metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Records</div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{metrics.total}</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Present</div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-700">{metrics.present}</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Checked In</div>
          <div className="mt-2 text-2xl font-extrabold text-sky-700">{metrics.checkedIn}</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Missing Punch</div>
          <div className="mt-2 text-2xl font-extrabold text-amber-700">{metrics.missingPunch}</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Late Arrivals</div>
          <div className="mt-2 text-2xl font-extrabold text-orange-700">{metrics.late}</div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Exceptions</div>
          <div className="mt-2 text-2xl font-extrabold text-rose-700">{metrics.exceptionsCount}</div>
        </div>
      </section>

      {/* Filter Controls Card */}
      <section aria-labelledby="filters-heading" className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <h2 id="filters-heading" className="text-base font-bold text-slate-900">
              Filter Attendance Records
            </h2>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="filter-date" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Date
            </label>
            <input
              id="filter-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
            />
          </div>

          <div>
            <label htmlFor="filter-employee" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Employee
            </label>
            <select
              id="filter-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} (Bio #{employee.biometric_id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-shift" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Shift
            </label>
            <select
              id="filter-shift"
              value={shiftId}
              onChange={(event) => setShiftId(event.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              <option value="">All shifts</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-status" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              id="filter-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as AttendanceStatus | "")}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              {statusOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Main Attendance Records Section */}
      <section aria-labelledby="attendance-table-heading" className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden space-y-0">
        <div className="border-b border-slate-200/80 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 id="attendance-table-heading" className="text-lg font-bold text-slate-900">
              Daily Attendance Records
            </h2>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {loading ? "Loading..." : `${rows.length} record${rows.length === 1 ? "" : "s"}`}
          </div>
        </div>

        {/* Admin Batch Operations Bar */}
        {role === "ADMIN" && (
          <div className="px-6 py-3 border-b border-slate-200/60 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="font-semibold text-slate-700">
              {selected.length} selected
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!selected.length || working}
                onClick={() => setConfirm("delete")}
                className="min-h-[36px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
              >
                Delete Selected
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => setConfirm("clear")}
                className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
              >
                Clear Selected Date
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => setConfirm("rebuild")}
                className="min-h-[36px] rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 font-bold text-[#028174] hover:bg-teal-100 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                Rebuild Selected Date
              </button>
              {selected.length > 0 && (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setSelected([])}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="p-6 space-y-3" role="status" aria-label="Loading attendance records">
            <span className="sr-only">Loading attendance records...</span>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}

        {/* Desktop Table View */}
        {!loading && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {role === "ADMIN" && (
                    <th className="p-3.5 w-10">
                      <input
                        aria-label="Select all attendance rows"
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.attendance_key))}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                    </th>
                  )}
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Bio ID</th>
                  <th className="p-3.5">Employee</th>
                  <th className="p-3.5">Emp ID</th>
                  <th className="p-3.5">Shift</th>
                  <th className="p-3.5">Punch In</th>
                  <th className="p-3.5">Punch Out</th>
                  <th className="p-3.5">Punches</th>
                  <th className="p-3.5">Late</th>
                  <th className="p-3.5">Early Exit</th>
                  <th className="p-3.5">Working Hours</th>
                  <th className="p-3.5">Note</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const isChecked = selected.includes(row.attendance_key);
                  return (
                    <Fragment key={row.attendance_key}>
                      <tr className={`transition-colors hover:bg-slate-50/60 ${isChecked ? "bg-teal-50/40" : ""}`}>
                        {role === "ADMIN" && (
                          <td className="p-3.5">
                            <input
                              aria-label={`Select ${row.attendance_key}`}
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggle(row.attendance_key)}
                              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                          </td>
                        )}
                        <td className="p-3.5 font-medium text-slate-900">{formatAttendanceDate(row.attendance_date)}</td>
                        <td className="p-3.5 font-mono text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
                          #{row.biometric_id}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900">{row.employee_name ?? "Unmatched"}</td>
                        <td className="p-3.5 font-mono text-xs text-slate-600">{row.employee_code}</td>
                        <td className="p-3.5 text-slate-600">{row.shift_name ?? "—"}</td>
                        <td className="p-3.5 font-medium text-slate-900">{formatTimeOnly(row.punch_in_at)}</td>
                        <td className="p-3.5 font-medium text-slate-900">{formatTimeOnly(row.punch_out_at)}</td>
                        <td className="p-3.5 text-center font-mono font-semibold text-slate-700">{row.raw_punch_count}</td>
                        <td className="p-3.5">
                          {row.late_minutes > 0 ? (
                            <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                              {row.late_minutes} min
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {row.early_exit_minutes > 0 ? (
                            <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                              {row.early_exit_minutes} min
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900">{formatWorkingMinutes(row.working_minutes)}</td>
                        <td className="p-3.5 text-slate-500">{row.note ?? "—"}</td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border ${
                              row.status === "PRESENT"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : row.status === "CURRENTLY_CHECKED_IN"
                                  ? "bg-sky-50 text-sky-800 border-sky-300"
                                  : row.status === "MISSING_PUNCH"
                                    ? "bg-amber-50 text-amber-800 border-amber-300"
                                    : row.status === "NO_SHIFT"
                                      ? "bg-purple-50 text-purple-800 border-purple-300"
                                      : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {row.status.replaceAll("_", " ")}
                          </span>
                        </td>
                      </tr>

                      {row.session_records && row.session_records.length > 0 && (
                        <tr className="bg-slate-50/40">
                          <td colSpan={role === "ADMIN" ? 14 : 13} className="px-6 py-3">
                            <div className="text-xs font-bold text-slate-700 mb-2">
                              Sessions Breakdown ({row.session_records.length} session{row.session_records.length === 1 ? "" : "s"}):
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {row.session_records.map((sr) => (
                                <div key={`sr-${sr.session_number}`} className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5 text-xs shadow-xs">
                                  <div className="flex items-center justify-between border-b border-slate-100 pb-1 font-semibold text-slate-800">
                                    <span>{sr.session_name}</span>
                                    <span className="text-slate-500 font-mono">{sr.start_time} - {sr.end_time}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1 text-slate-600">
                                    <div>In: <strong className="text-slate-900">{formatTimeOnly(sr.punch_in_at)}</strong></div>
                                    <div>Out: <strong className="text-slate-900">{formatTimeOnly(sr.punch_out_at)}</strong></div>
                                    <div>Work: <strong className="text-[#028174]">{formatWorkingMinutes(sr.worked_minutes)}</strong></div>
                                    <div>Status: <span className="font-bold text-slate-700">{sr.status.replaceAll("_", " ")}</span></div>
                                  </div>
                                  {(sr.late_minutes > 0 || sr.early_exit_minutes > 0 || sr.missing_punch) && (
                                    <div className="flex flex-wrap gap-1 pt-1 text-[11px]">
                                      {sr.late_minutes > 0 && <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">Late {sr.late_minutes}m</span>}
                                      {sr.early_exit_minutes > 0 && <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">Early {sr.early_exit_minutes}m</span>}
                                      {sr.missing_punch && <span className="bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded">Missing Punch</span>}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={role === "ADMIN" ? 14 : 13} className="p-8 text-center text-sm text-slate-500">
                      No attendance records found for the selected criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile View (768px and below) */}
        {!loading && (
          <div className="block md:hidden divide-y divide-slate-100">
            {rows.map((row) => {
              const isChecked = selected.includes(row.attendance_key);
              return (
                <div key={row.attendance_key} className={`p-4 space-y-3 ${isChecked ? "bg-teal-50/40" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {role === "ADMIN" && (
                        <input
                          aria-label={`Select ${row.attendance_key}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(row.attendance_key)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      )}
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          {row.employee_name ?? "Unmatched"}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-2 text-xs font-medium text-slate-500">
                          <span>Emp ID: <strong>{row.employee_code}</strong></span>
                          <span>•</span>
                          <span>Bio ID: <strong className="text-teal-700">#{row.biometric_id}</strong></span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border ${
                        row.status === "PRESENT"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : row.status === "CURRENTLY_CHECKED_IN"
                            ? "bg-sky-50 text-sky-800 border-sky-300"
                            : row.status === "MISSING_PUNCH"
                              ? "bg-amber-50 text-amber-800 border-amber-300"
                              : row.status === "NO_SHIFT"
                                ? "bg-purple-50 text-purple-800 border-purple-300"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {row.status.replaceAll("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Shift:</span>
                      <span className="font-semibold text-slate-900">{row.shift_name ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Date:</span>
                      <span className="font-semibold text-slate-900">{formatAttendanceDate(row.attendance_date)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">First In:</span>
                      <span className="font-semibold text-slate-900">{formatTimeOnly(row.punch_in_at)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Last Out:</span>
                      <span className="font-semibold text-slate-900">{formatTimeOnly(row.punch_out_at)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Total Work:</span>
                      <span className="font-bold text-teal-800">{formatWorkingMinutes(row.working_minutes)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Punches Count:</span>
                      <span className="font-semibold text-slate-900">{row.raw_punch_count}</span>
                    </div>
                  </div>

                  {row.session_records && row.session_records.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-bold text-slate-700">Sessions Breakdown:</div>
                      {row.session_records.map((sr) => (
                        <div key={`m-sr-${sr.session_number}`} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span>{sr.session_name}</span>
                            <span className="text-slate-500 font-mono text-[11px]">{sr.start_time} - {sr.end_time}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-slate-600">
                            <div>In: <strong>{formatTimeOnly(sr.punch_in_at)}</strong></div>
                            <div>Out: <strong>{formatTimeOnly(sr.punch_out_at)}</strong></div>
                            <div>Work: <strong className="text-[#028174]">{formatWorkingMinutes(sr.worked_minutes)}</strong></div>
                            <div>Status: <strong className="text-slate-800">{sr.status.replaceAll("_", " ")}</strong></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(row.late_minutes > 0 || row.early_exit_minutes > 0 || row.note) && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {row.late_minutes > 0 && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                          Late: {row.late_minutes} min
                        </span>
                      )}
                      {row.early_exit_minutes > 0 && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                          Early Exit: {row.early_exit_minutes} min
                        </span>
                      )}
                      {row.note && (
                        <span className="text-slate-500 italic">Note: {row.note}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {rows.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">
                No attendance records found for the selected criteria.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Confirmation Modal for Attendance Records */}
      <ConfirmationModal
        open={confirm !== null}
        pending={working}
        recordName="attendance records"
        title={
          confirm === "rebuild"
            ? "Rebuild attendance?"
            : confirm === "clear"
              ? "Clear attendance for selected date?"
              : "Delete selected attendance?"
        }
        message={
          confirm === "rebuild"
            ? "Attendance will be rebuilt from existing raw biometric punches."
            : "Clear attendance records for the selected date? Raw biometric punches will remain and attendance can be rebuilt."
        }
        confirmLabel={confirm === "rebuild" ? "Rebuild" : confirm === "clear" ? "Clear Date" : "Delete Selected"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run()}
      />

      {/* Attendance Exceptions Section */}
      <section aria-labelledby="exceptions-table-heading" className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden space-y-0">
        <div className="border-b border-slate-200/80 px-6 py-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="exceptions-table-heading" className="text-lg font-bold text-slate-900">
              Attendance Exceptions
            </h2>
            <p className="text-xs text-slate-500">
              Raw punches recorded outside the assigned shift window are safely preserved here.
            </p>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {exceptions.length} exception{exceptions.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Admin Exceptions Action Bar */}
        {role === "ADMIN" && (
          <div className="px-6 py-3 border-b border-slate-200/60 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="font-semibold text-slate-700">
              {selectedExceptions.length} selected
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!selectedExceptions.length || working}
                onClick={() => setExceptionAction("resolve")}
                className="min-h-[36px] rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 font-bold text-[#028174] hover:bg-teal-100 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                Resolve Selected
              </button>
              <button
                type="button"
                disabled={!selectedExceptions.length || working}
                onClick={() => setExceptionAction("delete")}
                className="min-h-[36px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
              >
                Delete Selected Safe/Test Exceptions
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => setExceptionAction("clear-today")}
                className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
              >
                Clear Today
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => setExceptionAction("clear-date")}
                className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
              >
                Clear Selected Date
              </button>
              {selectedExceptions.length > 0 && (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setSelectedExceptions([])}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        )}

        {/* Desktop Exceptions Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {role === "ADMIN" && (
                  <th className="p-3.5 w-10">
                    <input
                      aria-label="Select all visible attendance exceptions"
                      type="checkbox"
                      checked={allExceptionsSelected}
                      onChange={() =>
                        setSelectedExceptions(
                          allExceptionsSelected ? [] : exceptions.map((exception) => exception.raw_punch_id)
                        )
                      }
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                )}
                <th className="p-3.5">Employee</th>
                <th className="p-3.5">Bio ID</th>
                <th className="p-3.5">Shift</th>
                <th className="p-3.5">Punch Time</th>
                <th className="p-3.5">Note / Exception Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exceptions.map((exception) => {
                const isChecked = selectedExceptions.includes(exception.raw_punch_id);
                return (
                  <tr key={exception.raw_punch_id} className={`transition-colors hover:bg-slate-50/60 ${isChecked ? "bg-teal-50/40" : ""}`}>
                    {role === "ADMIN" && (
                      <td className="p-3.5">
                        <input
                          aria-label={`Select exception ${exception.raw_punch_id}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleException(exception.raw_punch_id)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                    )}
                    <td className="p-3.5 font-semibold text-slate-900">{exception.employee_name}</td>
                    <td className="p-3.5 font-mono text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
                      #{exception.biometric_id}
                    </td>
                    <td className="p-3.5 text-slate-600">{exception.shift_name}</td>
                    <td className="p-3.5 font-medium text-slate-900">{formatTimeOnly(exception.punch_time)}</td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200 shrink-0">
                          OUT OF SHIFT
                        </span>
                        <span className="text-slate-600">{exception.message}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {exceptions.length === 0 && (
                <tr>
                  <td colSpan={role === "ADMIN" ? 6 : 5} className="p-8 text-center text-sm text-slate-500">
                    No attendance exceptions found for the selected date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Exceptions View (768px and below) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {exceptions.map((exception) => {
            const isChecked = selectedExceptions.includes(exception.raw_punch_id);
            return (
              <div key={exception.raw_punch_id} className={`p-4 space-y-2 ${isChecked ? "bg-teal-50/40" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {role === "ADMIN" && (
                      <input
                        aria-label={`Select exception ${exception.raw_punch_id}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleException(exception.raw_punch_id)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                    )}
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{exception.employee_name}</h3>
                      <div className="text-xs text-teal-700 font-mono font-semibold">Bio #{exception.biometric_id}</div>
                    </div>
                  </div>
                  <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
                    OUT OF SHIFT
                  </span>
                </div>

                <div className="text-xs text-slate-600">
                  <span>Shift: <strong className="text-slate-900">{exception.shift_name}</strong></span> • <span>Punch Time: <strong className="text-slate-900">{formatTimeOnly(exception.punch_time)}</strong></span>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {exception.message}
                </div>
              </div>
            );
          })}

          {exceptions.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No attendance exceptions found for the selected date.
            </div>
          )}
        </div>
      </section>

      {/* Confirmation Modal for Exceptions */}
      <ConfirmationModal
        open={exceptionAction !== null}
        pending={working}
        recordName="attendance exceptions"
        title={
          exceptionAction === "resolve"
            ? "Resolve selected exceptions?"
            : exceptionAction === "clear-today"
              ? "Clear today's safe/test exceptions?"
              : exceptionAction === "clear-date"
                ? "Clear safe/test exceptions for the selected date?"
                : "Delete selected safe/test exceptions?"
        }
        message={
          exceptionAction === "resolve"
            ? "The selected exceptions will be marked as resolved."
            : "Only safe/test exceptions can be deleted. Protected exceptions will be skipped."
        }
        confirmLabel={
          exceptionAction === "resolve"
            ? "Resolve Selected"
            : exceptionAction === "clear-today"
              ? "Clear Today"
              : exceptionAction === "clear-date"
                ? "Clear Selected Date"
                : "Delete Selected"
        }
        onCancel={() => setExceptionAction(null)}
        onConfirm={() => void runExceptionAction()}
      />
    </div>
  );
}
