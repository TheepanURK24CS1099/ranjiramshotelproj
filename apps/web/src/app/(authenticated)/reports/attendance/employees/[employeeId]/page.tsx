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

type DailyRow = {
  date: string;
  shift: string;
  first_punch_in: string | null;
  last_punch_out: string | null;
  worked_duration: string;
  attendance_status: string;
  late_by: string;
  early_exit_by: string;
  overtime: string;
  missing_punch: string;
  notes: string;
};

type Summary = {
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  earlyExits: number;
  holidays: number;
  weeklyOffs: number;
  missingPunches: number;
  totalWorkedHours: string;
  overtimeHours: string;
};

type ReportData = {
  employee: EmployeeHeader;
  summary: Summary;
  items: DailyRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

const STATUS_COLORS: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-800",
  LATE: "bg-yellow-100 text-yellow-800",
  ABSENT: "bg-red-100 text-red-800",
  EARLY_EXIT: "bg-orange-100 text-orange-800",
  LATE_AND_EARLY_EXIT: "bg-orange-200 text-orange-900",
  HALF_DAY: "bg-blue-100 text-blue-800",
  MISSING_PUNCH: "bg-red-200 text-red-900",
  WEEKLY_OFF: "bg-gray-100 text-gray-600",
  HOLIDAY: "bg-purple-100 text-purple-800",
  NO_SHIFT: "bg-gray-100 text-gray-500",
};

function todayMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().substring(0, 10);
}

const SUMMARY_LABELS: Array<[keyof Summary, string]> = [
  ["totalWorkingDays", "Total Working Days"],
  ["presentDays", "Present"],
  ["absentDays", "Absent"],
  ["lateDays", "Late"],
  ["earlyExits", "Early Exits"],
  ["holidays", "Holidays"],
  ["weeklyOffs", "Weekly Offs"],
  ["missingPunches", "Missing Punches"],
  ["totalWorkedHours", "Worked Hours"],
  ["overtimeHours", "Overtime Hours"],
];

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

  useEffect(() => { load(); }, [load]);

  const applyFilters = () => { setPage(1); setAppliedFrom(fromDate); setAppliedTo(toDate); };

  const exportFile = async (format: "csv" | "pdf") => {
    const q = new URLSearchParams({ fromDate: appliedFrom, toDate: appliedTo });
    const response = await fetch(
      `${config.apiUrl}/reports/employees/${employeeId}/attendance/export.${format}?${q.toString()}`,
      { credentials: "include" }
    );
    if (!response.ok) { setError("Export failed"); return; }
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${employeeId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const emp = data?.employee;
  const summary = data?.summary;
  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Back button + title */}
      <div className="flex items-center gap-3">
        <button
          id="btn-back-to-attendance"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 border rounded px-3 py-1.5"
        >
          ← Back to Attendance
        </button>
        <h1 className="text-2xl font-bold">Individual Attendance Report</h1>
      </div>

      {/* Employee header card */}
      {emp && (
        <div className="bg-white rounded shadow p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Name</div>
            <div className="font-semibold text-lg">{emp.name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Employee Code</div>
            <div className="font-medium">{emp.employee_code}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Biometric ID</div>
            <div className="font-medium">{emp.biometric_id}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Shift</div>
            <div className="font-medium">{emp.current_shift}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Status</div>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                emp.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {emp.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Period</div>
            <div className="font-medium">{appliedFrom} → {appliedTo}</div>
          </div>
        </div>
      )}

      {/* Filters and export actions */}
      <div className="bg-white rounded shadow p-4 flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">From date</span>
          <input
            id="input-from-date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border rounded px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">To date</span>
          <input
            id="input-to-date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border rounded px-2 py-1.5"
          />
        </label>
        <button
          id="btn-apply-filters"
          onClick={applyFilters}
          className="rounded bg-blue-600 text-white px-4 py-1.5 text-sm hover:bg-blue-700"
        >
          Apply
        </button>
        <div className="flex-1" />
        <button
          id="btn-export-csv"
          onClick={() => void exportFile("csv")}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          CSV / Excel
        </button>
        <button
          id="btn-export-pdf"
          onClick={() => void exportFile("pdf")}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Printable PDF
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700">{error}</div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SUMMARY_LABELS.map(([key, label]) => (
            <div key={key} className="rounded bg-white shadow p-4">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="text-xl font-semibold mt-1">{String(summary[key])}</div>
            </div>
          ))}
        </div>
      )}

      {/* Daily records table */}
      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading report…</div>
      ) : (
        <div className="overflow-x-auto rounded bg-white shadow">
          {items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No attendance records for this period.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Shift</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">First Punch In</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Last Punch Out</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Worked Duration</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Status</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Late By</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Early Exit By</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Overtime</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Missing Punch</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap font-medium">{row.date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.shift}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.first_punch_in ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.last_punch_out ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.worked_duration}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[row.attendance_status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {row.attendance_status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.late_by}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.early_exit_by}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.overtime}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.missing_punch}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={row.notes}>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center gap-3">
          <button
            id="btn-prev-page"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm">Page {pagination.page} of {pagination.pages}</span>
          <button
            id="btn-next-page"
            disabled={page >= pagination.pages}
            onClick={() => setPage(page + 1)}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
