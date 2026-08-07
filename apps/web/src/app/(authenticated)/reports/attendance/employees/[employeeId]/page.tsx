"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { config } from "@/lib/config";

type EmployeeHeader = {
  id: string;
  name: string;
  employee_code: string;
  biometric_id: string;
  active: boolean;
  current_shift: string;
};

type ShiftSummaryDetail = {
  present: number;
  late: number;
  earlyExit: number;
  absent: number;
  halfDay: number;
  checkinMissing: number;
  checkoutMissing: number;
  pending: number;
  completed: number;
  expected: number;
};

type DailyRow = {
  date: string;
  shift: string;
  shift1_status: string;
  shift2_status: string;
  worked_duration: string;
  notes: string;
  remarks?: string;
};

type Summary = {
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  shift1: string;
  shift2: string;
  shift1Summary: ShiftSummaryDetail;
  shift2Summary: ShiftSummaryDetail;
};

type ReportData = {
  employee: EmployeeHeader;
  summary: Summary;
  items: DailyRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

function getStatusBadgeClass(status: string) {
  if (status === "Present") return "bg-emerald-50 text-emerald-800 border-emerald-300";
  if (status === "Late" || status === "Early Exit" || status === "Late & Early Exit") return "bg-amber-50 text-amber-800 border-amber-300";
  if (status === "Absent") return "bg-rose-50 text-rose-800 border-rose-300";
  if (status === "Half Day") return "bg-sky-50 text-sky-800 border-sky-300";
  if (status === "Check-in Missing" || status === "Check-out Missing") return "bg-rose-100 text-rose-900 border-rose-300";
  if (status === "Weekly Off") return "bg-slate-100 text-slate-600 border-slate-200";
  if (status === "Holiday") return "bg-purple-50 text-purple-800 border-purple-300";
  if (status === "Pending") return "bg-amber-50 text-amber-800 border-amber-300";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function todayMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().substring(0, 10);
}

export default function EmployeeAttendanceReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeId = params.employeeId as string;

  const [fromDate, setFromDate] = useState(searchParams.get("fromDate") ?? todayMinus(29));
  const [toDate, setToDate] = useState(searchParams.get("toDate") ?? todayMinus(0));
  const [appliedFrom, setAppliedFrom] = useState(fromDate);
  const [appliedTo, setAppliedTo] = useState(toDate);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ fromDate: appliedFrom, toDate: appliedTo, page: String(page) });
    apiClient
      .get(`/reports/employees/${employeeId}/attendance?${q.toString()}`)
      .then((d) => setData(d as ReportData))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [employeeId, appliedFrom, appliedTo, page]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  };

  const exportFile = async (format: "csv" | "pdf") => {
    const q = new URLSearchParams({ fromDate: appliedFrom, toDate: appliedTo });
    const response = await fetch(
      `${config.apiUrl}/reports/employees/${employeeId}/attendance/export.${format}?${q.toString()}`,
      { credentials: "include" }
    );
    if (!response.ok) {
      setError("Export failed");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${employeeId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const emp = data?.employee;
  const summary = data?.summary;
  const s1 = summary?.shift1Summary;
  const s2 = summary?.shift2Summary;
  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-4">
      {/* Navigation Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            id="btn-back-to-attendance"
            onClick={() => router.back()}
            className="inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl px-3 py-1.5 shadow-xs hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
          >
            ← Back to Attendance
          </button>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Individual Attendance Report
          </h1>
        </div>
      </div>

      {/* Employee Information Card */}
      {emp && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee Name</div>
            <div className="font-extrabold text-slate-900 text-base mt-0.5">{emp.name}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</div>
            <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">{emp.employee_code}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Biometric ID</div>
            <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">{emp.biometric_id}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Shift</div>
            <div className="font-semibold text-slate-800 text-sm mt-0.5">{emp.current_shift}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</div>
            <div className="mt-0.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                  emp.active ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-rose-50 text-rose-800 border-rose-300"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${emp.active ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden="true" />
                {emp.active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period</div>
            <div className="font-semibold text-slate-800 text-xs mt-0.5">
              {appliedFrom} → {appliedTo}
            </div>
          </div>
        </div>
      )}

      {/* Date Filter & Export Controls Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-700">
            <span className="block text-slate-600 mb-1">From date</span>
            <input
              id="input-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
            />
          </label>

          <label className="text-xs font-semibold text-slate-700">
            <span className="block text-slate-600 mb-1">To date</span>
            <input
              id="input-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
            />
          </label>

          <button
            id="btn-apply-filters"
            onClick={applyFilters}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#028174] hover:bg-[#026c61] text-white px-5 py-2.5 text-sm font-semibold shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
          >
            Apply Filters
          </button>
        </div>

        <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
          <button
            id="btn-export-csv"
            onClick={() => void exportFile("csv")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
          >
            <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            CSV / Excel
          </button>
          <button
            id="btn-export-pdf"
            onClick={() => void exportFile("pdf")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
          >
            <svg className="h-4 w-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Printable PDF
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 flex items-center gap-2" role="alert">
          <svg className="h-5 w-5 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Period Top Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Days</div>
            <div className="text-xl font-extrabold text-slate-900 mt-1">{summary.totalWorkingDays}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Present</div>
            <div className="text-xl font-extrabold text-emerald-600 mt-1">{summary.presentDays}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Absent</div>
            <div className="text-xl font-extrabold text-rose-600 mt-1">{summary.absentDays}</div>
          </div>
          <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 shadow-xs">
            <div className="text-xs font-semibold text-[#028174] uppercase tracking-wider">Shift 1</div>
            <div className="text-xl font-extrabold text-slate-900 mt-1">{summary.shift1 || "0 / 0"}</div>
          </div>
          <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 shadow-xs">
            <div className="text-xs font-semibold text-[#028174] uppercase tracking-wider">Shift 2</div>
            <div className="text-xl font-extrabold text-slate-900 mt-1">{summary.shift2 || "0 / 0"}</div>
          </div>
        </div>
      )}

      {/* Shift 1 & Shift 2 Summary Cards Breakdown */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Shift 1 Summary Box */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-[#028174] uppercase tracking-wider flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#028174]" />
                Shift 1 Summary
              </h2>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                Completed: {summary.shift1 || "0 / 0"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="bg-teal-50/60 border border-teal-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-teal-800">Expected</div>
                <div className="text-lg font-bold text-teal-900 mt-0.5">{s1?.expected ?? 0}</div>
              </div>
              <div className="bg-teal-50/60 border border-teal-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-teal-800">Completed</div>
                <div className="text-lg font-bold text-teal-900 mt-0.5">{s1?.completed ?? 0}</div>
              </div>
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-emerald-800">Present</div>
                <div className="text-lg font-bold text-emerald-900 mt-0.5">{s1?.present ?? 0}</div>
              </div>
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-amber-800">Late</div>
                <div className="text-lg font-bold text-amber-900 mt-0.5">{s1?.late ?? 0}</div>
              </div>
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-amber-800">Early Exit</div>
                <div className="text-lg font-bold text-amber-900 mt-0.5">{s1?.earlyExit ?? 0}</div>
              </div>
              <div className="bg-sky-50/60 border border-sky-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-sky-800">Half Day</div>
                <div className="text-lg font-bold text-sky-900 mt-0.5">{s1?.halfDay ?? 0}</div>
              </div>
              <div className="bg-orange-50/60 border border-orange-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-orange-800">Check-in Missing</div>
                <div className="text-lg font-bold text-orange-900 mt-0.5">{s1?.checkinMissing ?? 0}</div>
              </div>
              <div className="bg-orange-50/60 border border-orange-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-orange-800">Check-out Missing</div>
                <div className="text-lg font-bold text-orange-900 mt-0.5">{s1?.checkoutMissing ?? 0}</div>
              </div>
              <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-rose-800">Absent</div>
                <div className="text-lg font-bold text-rose-900 mt-0.5">{s1?.absent ?? 0}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-slate-700">Pending</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">{s1?.pending ?? 0}</div>
              </div>
            </div>
          </div>

          {/* Shift 2 Summary Box */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-[#028174] uppercase tracking-wider flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#028174]" />
                Shift 2 Summary
              </h2>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                Completed: {summary.shift2 || "0 / 0"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="bg-teal-50/60 border border-teal-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-teal-800">Expected</div>
                <div className="text-lg font-bold text-teal-900 mt-0.5">{s2?.expected ?? 0}</div>
              </div>
              <div className="bg-teal-50/60 border border-teal-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-teal-800">Completed</div>
                <div className="text-lg font-bold text-teal-900 mt-0.5">{s2?.completed ?? 0}</div>
              </div>
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-emerald-800">Present</div>
                <div className="text-lg font-bold text-emerald-900 mt-0.5">{s2?.present ?? 0}</div>
              </div>
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-amber-800">Late</div>
                <div className="text-lg font-bold text-amber-900 mt-0.5">{s2?.late ?? 0}</div>
              </div>
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-amber-800">Early Exit</div>
                <div className="text-lg font-bold text-amber-900 mt-0.5">{s2?.earlyExit ?? 0}</div>
              </div>
              <div className="bg-sky-50/60 border border-sky-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-sky-800">Half Day</div>
                <div className="text-lg font-bold text-sky-900 mt-0.5">{s2?.halfDay ?? 0}</div>
              </div>
              <div className="bg-orange-50/60 border border-orange-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-orange-800">Check-in Missing</div>
                <div className="text-lg font-bold text-orange-900 mt-0.5">{s2?.checkinMissing ?? 0}</div>
              </div>
              <div className="bg-orange-50/60 border border-orange-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-orange-800">Check-out Missing</div>
                <div className="text-lg font-bold text-orange-900 mt-0.5">{s2?.checkoutMissing ?? 0}</div>
              </div>
              <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-rose-800">Absent</div>
                <div className="text-lg font-bold text-rose-900 mt-0.5">{s2?.absent ?? 0}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-slate-700">Pending</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">{s2?.pending ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Breakdown Table */}
      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-slate-500 text-sm font-medium shadow-xs border border-slate-200/90" role="status">
          Loading report…
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Daily Breakdown</h2>
          </div>
          {items.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm font-medium">
              No attendance records for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3.5 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">Shift 1 Status</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">Shift 2 Status</th>
                    <th className="px-4 py-3.5 whitespace-nowrap text-right">Working Hours</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3.5 whitespace-nowrap font-bold text-slate-900">{row.date}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${getStatusBadgeClass(
                            row.shift1_status,
                          )}`}
                        >
                          {row.shift1_status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${getStatusBadgeClass(
                            row.shift2_status,
                          )}`}
                        >
                          {row.shift2_status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right font-semibold text-slate-900">
                        {row.worked_duration}
                      </td>
                      <td className="px-4 py-3.5 max-w-xs truncate text-xs text-slate-500" title={row.remarks || row.notes}>
                        {row.remarks || row.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-slate-600 font-medium">
            Page <span className="font-bold text-slate-900">{pagination.page}</span> of{" "}
            <span className="font-bold text-slate-900">{pagination.pages}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              id="btn-prev-page"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="min-h-[36px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
            >
              Previous
            </button>
            <button
              id="btn-next-page"
              disabled={page >= pagination.pages}
              onClick={() => setPage(page + 1)}
              className="min-h-[36px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
