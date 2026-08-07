"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { config } from "@/lib/config";
import { formatWorkingMinutes } from "@/lib/format";

const reports = [
  ["attendance-summary", "Attendance"],
  ["payroll-summary", "Payroll"],
  ["salary-history", "Salary History"],
  ["advances", "Advances"],
  ["device-logs", "Devices"],
  ["attendance-exceptions", "Exceptions"],
] as const;

type Report = (typeof reports)[number][0];
type Field = { key: string; label: string; type?: string; options?: string[] };

const common: Field[] = [
  { key: "fromDate", label: "From date", type: "date" },
  { key: "toDate", label: "To date", type: "date" },
  { key: "employeeId", label: "Employee ID" },
];

const fields: Record<Report, Field[]> = {
  "attendance-summary": [
    ...common,
    { key: "biometricId", label: "Biometric ID" },
    { key: "shiftId", label: "Shift ID" },
    { key: "status", label: "Attendance status" },
    { key: "active", label: "Active/inactive status", options: ["true", "false"] },
  ],
  "payroll-summary": [
    { key: "year", label: "Year", type: "number" },
    { key: "month", label: "Month", type: "number" },
    { key: "periodId", label: "Period ID" },
    { key: "employeeId", label: "Employee ID" },
    { key: "status", label: "Payroll status" },
  ],
  "salary-history": [
    ...common,
    { key: "salaryType", label: "Salary type" },
    { key: "activeOnly", label: "Active only", options: ["true", "false"] },
  ],
  advances: [...common, { key: "status", label: "Advance status" }],
  "device-logs": [
    { key: "deviceId", label: "Device ID" },
    { key: "fromDate", label: "From date", type: "date" },
    { key: "toDate", label: "To date", type: "date" },
  ],
  "attendance-exceptions": [
    ...common,
    { key: "exceptionType", label: "Exception type" },
    { key: "resolved", label: "Resolved", options: ["true", "false"] },
  ],
};

type UnmatchedRow = {
  biometric_id: string;
  device_name: string;
  first_seen: string;
  last_seen: string;
  total_records: number;
};

function UnmatchedDetail({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<UnmatchedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    apiClient
      .get("/auth/me")
      .then((u: any) => setIsAdmin(u?.role === "ADMIN"))
      .catch(() => setIsAdmin(false));
  }, []);

  const load = (p: number) => {
    setLoading(true);
    setError("");
    apiClient
      .get(`/reports/unmatched-biometrics?page=${p}&limit=25`)
      .then((d: any) => {
        setRows(d.items ?? []);
        setPages(d.pagination?.pages ?? 1);
        setPage(p);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Failed to load unmatched data"))
      .finally(() => setLoading(false));
  };

  const toggle = () => {
    if (!open && rows.length === 0) load(1);
    setOpen(!open);
  };

  if (!isAdmin) {
    return (
      <div id="card-historical-unmatched" className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/90">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Historical Unmatched IDs</div>
        <div className="text-2xl font-extrabold text-slate-900 mt-1">{count}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white shadow-xs border border-slate-200/90 col-span-1 sm:col-span-2 lg:col-span-1 overflow-hidden">
      <button
        id="btn-toggle-unmatched"
        onClick={toggle}
        className="w-full text-left p-5 flex justify-between items-center hover:bg-slate-50/80 transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Historical / Unmatched Biometric IDs
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{count}</div>
        </div>
        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
          {open ? "▲ Hide" : "▼ Details"}
        </span>
      </button>

      {open && (
        <div id="unmatched-detail-panel" className="border-t border-slate-200/80 px-5 py-4 bg-slate-50/50">
          {loading && <div className="py-4 text-center text-slate-500 text-xs font-medium">Loading unmatched biometric records…</div>}
          {error && <div className="py-3 text-rose-700 text-xs bg-rose-50 p-3 rounded-xl border border-rose-200">{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div className="py-4 text-center text-slate-500 text-xs font-medium">No unmatched biometric records found.</div>
          )}
          {!loading && rows.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Biometric ID</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Device</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">First Seen</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Last Seen</th>
                      <th className="px-3.5 py-2.5 text-right whitespace-nowrap">Total Records</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2.5 font-mono font-bold text-slate-900">{r.biometric_id}</td>
                        <td className="px-3.5 py-2.5 text-slate-700">{r.device_name}</td>
                        <td className="px-3.5 py-2.5 text-slate-500">{r.first_seen}</td>
                        <td className="px-3.5 py-2.5 text-slate-500">{r.last_seen}</td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-slate-900">{r.total_records}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between gap-3 mt-3">
                  <button
                    disabled={page <= 1}
                    onClick={() => load(page - 1)}
                    className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-slate-600 font-medium">
                    Page {page} of {pages}
                  </span>
                  <button
                    disabled={page >= pages}
                    onClick={() => load(page + 1)}
                    className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const ATTENDANCE_SUMMARY_COLUMNS = [
  "employee",
  "employee_code",
  "biometric_id",
  "shift",
  "active_status",
  "total_working_days",
  "present_days",
  "absent_days",
  "shift1_summary",
  "shift2_summary",
  "view_report",
];

function getColumnHeader(c: string): string {
  if (c === "employee") return "Employee";
  if (c === "employee_code") return "Employee ID";
  if (c === "biometric_id") return "Biometric ID";
  if (c === "shift") return "Shift";
  if (c === "active_status") return "Active Status";
  if (c === "total_working_days") return "Total Days";
  if (c === "present_days") return "Present";
  if (c === "absent_days") return "Absent";
  if (c === "shift1_summary") return "Shift 1";
  if (c === "shift2_summary") return "Shift 2";
  if (c === "view_report") return "View";
  return c.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function renderCell(c: string, row: Record<string, unknown>) {
  const val = row[c];
  if (c === "view_report") {
    return (
      <a
        id={`btn-view-report-${row.employee_id}`}
        href={`/reports/attendance/employees/${row.employee_id}`}
        title="View Report"
        aria-label="View Report"
        className="inline-flex min-h-[32px] items-center justify-center px-3.5 py-1 text-xs font-bold text-[#028174] bg-teal-50 border border-teal-200 rounded-lg hover:bg-[#028174] hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        View
      </a>
    );
  }

  if (c === "shift1_summary" || c === "shift2_summary") {
    return <span className="font-semibold text-slate-900">{String(val ?? "0 / 0")}</span>;
  }

  if (val === null || val === undefined) return <span className="text-slate-400">—</span>;

  if (typeof val === "boolean") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
          val ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-slate-100 text-slate-700 border-slate-200"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${val ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
        {val ? "Active" : "Inactive"}
      </span>
    );
  }

  const strVal = String(val);
  if (c === "status" || c === "attendance_status" || c === "payroll_status") {
    let badgeClass = "bg-slate-100 text-slate-800 border-slate-200";
    if (strVal === "PRESENT" || strVal === "PAID" || strVal === "APPROVED") {
      badgeClass = "bg-emerald-50 text-emerald-800 border-emerald-300";
    } else if (strVal === "ABSENT" || strVal === "REJECTED" || strVal === "CANCELLED") {
      badgeClass = "bg-rose-50 text-rose-800 border-rose-300";
    } else if (strVal === "LATE" || strVal === "PENDING" || strVal === "GENERATED") {
      badgeClass = "bg-amber-50 text-amber-800 border-amber-300";
    } else if (strVal === "MISSING_PUNCH" || strVal === "UNMATCHED" || strVal === "DRAFT") {
      badgeClass = "bg-orange-50 text-orange-800 border-orange-300";
    }
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border ${badgeClass}`}>
        {strVal.replaceAll("_", " ")}
      </span>
    );
  }

  if (c === "biometric_id" || c === "employee_code") {
    return <span className="font-mono font-semibold text-slate-900">{strVal}</span>;
  }

  return strVal;
}

export default function ReportsPage() {
  const [selected, setSelected] = useState<Report>("attendance-summary");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo(
    () => new URLSearchParams(Object.entries({ ...applied, page: String(page) }).filter(([, v]) => v)).toString(),
    [applied, page],
  );

  useEffect(() => {
    setLoading(true);
    setError("");
    apiClient
      .get(`/reports/${selected}?${query}`)
      .then(setData)
      .catch((e) => setError(e.message ?? "Unable to load report"))
      .finally(() => setLoading(false));
  }, [selected, query]);

  const apply = () => {
    setPage(1);
    setApplied(filters);
  };
  const reset = () => {
    setFilters({});
    setApplied({});
    setPage(1);
  };
  const switchReport = (report: Report) => {
    setSelected(report);
    setFilters({});
    setApplied({});
    setPage(1);
  };

  const exportFile = async (format: "csv" | "pdf") => {
    const response = await fetch(`${config.apiUrl}/reports/${selected}/export.${format}?${query}`, {
      credentials: "include",
    });
    if (!response.ok) {
      setError("Export failed");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const items: Record<string, unknown>[] = data?.items ?? [];
  const columns =
    selected === "attendance-summary"
      ? ATTENDANCE_SUMMARY_COLUMNS
      : Object.keys(items[0] ?? {}).filter((c) => c !== "employee_id");
  const summary: Record<string, unknown> = data?.summary ?? {};

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-4">
      {/* Top Header */}
      <div className="border-b border-slate-200/80 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Reports &amp; Exports</h1>
        <p className="mt-1 text-sm text-slate-600">Operational and financial reports formatted in India Standard Time.</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200/80 pb-3" role="tablist" aria-label="Report Categories">
        {reports.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={selected === id}
            onClick={() => switchReport(id)}
            className={`min-h-[40px] rounded-xl px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${
              selected === id
                ? "bg-[#028174] text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/90"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filter Options Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Filter Options</h2>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          {fields[selected].map((field) =>
            field.options ? (
              <label key={field.key} className="text-xs font-semibold text-slate-700">
                {field.label}
                <select
                  aria-label={field.label}
                  value={filters[field.key] ?? ""}
                  onChange={(e) => setFilters({ ...filters, [field.key]: e.target.value })}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                >
                  <option value="">Any</option>
                  {field.options.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label key={field.key} className="text-xs font-semibold text-slate-700">
                {field.label}
                <input
                  aria-label={field.label}
                  type={field.type ?? "text"}
                  value={filters[field.key] ?? ""}
                  onChange={(e) => setFilters({ ...filters, [field.key]: e.target.value })}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </label>
            ),
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={apply}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#028174] hover:bg-[#026c61] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
            >
              Apply Filters
            </button>
            <button
              onClick={reset}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-slate-600"
            >
              Clear Filters
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void exportFile("csv")}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
            >
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV / Excel
            </button>
            <button
              onClick={() => void exportFile("pdf")}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
            >
              <svg className="h-4 w-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Printable PDF
            </button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 flex items-center gap-2" role="alert">
          <svg className="h-5 w-5 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-slate-500 shadow-xs border border-slate-200/90 text-sm font-medium" role="status">
          Loading report data…
        </div>
      ) : (
        <>
          {/* Summary Cards Grid */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {Object.entries(summary).map(([key, val]) =>
              key === "historicalUnmatchedIds" ? (
                <UnmatchedDetail key={key} count={Number(val)} />
              ) : (
                <div key={key} className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/90">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {key.replace(/([A-Z])/g, " $1")}
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 mt-1">{String(val)}</div>
                </div>
              ),
            )}
          </div>

          {/* Main Table */}
          <div className="overflow-x-auto rounded-2xl bg-white shadow-xs border border-slate-200/90">
            {items.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                <p className="font-bold text-slate-900 text-base">No matching report data.</p>
                <p className="text-xs text-slate-500 mt-1">Try adjusting your date range or filter criteria.</p>
              </div>
            ) : (
              <table className="min-w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {columns.map((c) => {
                      const isCentered = ["total_working_days", "present_days", "absent_days", "shift1_summary", "shift2_summary", "view_report"].includes(c);
                      const isShiftCol = ["shift1_summary", "shift2_summary"].includes(c);
                      const isNumericCol = ["total_working_days", "present_days", "absent_days"].includes(c);
                      const paddingClass = isShiftCol ? "px-8 py-4 min-w-[130px]" : isNumericCol ? "px-6 py-4 min-w-[100px]" : "px-5 py-4";
                      return (
                        <th className={`${paddingClass} whitespace-nowrap ${isCentered ? "text-center" : "text-left"}`} key={c}>
                          {getColumnHeader(c)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((row, i) => (
                    <tr className="hover:bg-slate-50/70 transition-colors" key={i}>
                      {columns.map((c) => {
                        const isCentered = ["total_working_days", "present_days", "absent_days", "shift1_summary", "shift2_summary", "view_report"].includes(c);
                        const isShiftCol = ["shift1_summary", "shift2_summary"].includes(c);
                        const isNumericCol = ["total_working_days", "present_days", "absent_days"].includes(c);
                        const paddingClass = isShiftCol ? "px-8 py-4 min-w-[130px]" : isNumericCol ? "px-6 py-4 min-w-[100px]" : "px-5 py-4";
                        return (
                          <td className={`${paddingClass} whitespace-nowrap text-slate-700 ${isCentered ? "text-center font-medium" : "text-left"}`} key={c}>
                            {renderCell(c, row)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {data?.pagination && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-xs font-medium text-slate-600">
                Page <span className="font-bold text-slate-900">{data.pagination.page}</span> of{" "}
                <span className="font-bold text-slate-900">{data.pagination.pages}</span> ({data.pagination.total}{" "}
                total records)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="min-h-[36px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
                >
                  Previous
                </button>
                <button
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage(page + 1)}
                  className="min-h-[36px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
