"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { config } from "@/lib/config";

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
      <div id="card-historical-unmatched" className="rounded-lg bg-white p-5 shadow-sm border border-gray-200">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Historical Unmatched IDs</div>
        <div className="text-2xl font-bold text-gray-900 mt-1">{count}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white shadow-sm border border-gray-200 col-span-1 sm:col-span-2 lg:col-span-1">
      <button
        id="btn-toggle-unmatched"
        onClick={toggle}
        className="w-full text-left p-5 flex justify-between items-center hover:bg-gray-50/80 transition-colors rounded-lg focus:outline-none"
      >
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Historical / Unmatched Biometric IDs
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{count}</div>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
          {open ? "▲ Hide" : "▼ Details"}
        </span>
      </button>

      {open && (
        <div id="unmatched-detail-panel" className="border-t border-gray-200 px-5 py-4 bg-gray-50/30">
          {loading && <div className="py-4 text-center text-gray-500 text-sm">Loading unmatched biometric records…</div>}
          {error && <div className="py-3 text-red-600 text-sm bg-red-50 p-3 rounded border border-red-200">{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div className="py-4 text-center text-gray-500 text-sm">No unmatched biometric records found.</div>
          )}
          {!loading && rows.length > 0 && (
            <>
              <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 font-semibold uppercase">
                    <tr>
                      <th className="px-3 py-2.5 text-left whitespace-nowrap">Biometric ID</th>
                      <th className="px-3 py-2.5 text-left whitespace-nowrap">Device</th>
                      <th className="px-3 py-2.5 text-left whitespace-nowrap">First Seen</th>
                      <th className="px-3 py-2.5 text-left whitespace-nowrap">Last Seen</th>
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">Total Records</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/80">
                        <td className="px-3 py-2 font-mono font-medium text-gray-900">{r.biometric_id}</td>
                        <td className="px-3 py-2 text-gray-700">{r.device_name}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{r.first_seen}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{r.last_seen}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{r.total_records}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between gap-3 mt-3 pt-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => load(page - 1)}
                    className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-600 font-medium">
                    Page {page} of {pages}
                  </span>
                  <button
                    disabled={page >= pages}
                    onClick={() => load(page + 1)}
                    className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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

function renderCell(c: string, row: Record<string, unknown>) {
  const val = row[c];
  if (c === "view_report") {
    return (
      <a
        id={`btn-view-report-${row.employee_id}`}
        href={`/reports/attendance/employees/${row.employee_id}`}
        className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
      >
        View Report
      </a>
    );
  }

  if (val === null || val === undefined) return <span className="text-gray-400">—</span>;

  if (typeof val === "boolean") {
    return (
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
          val ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-gray-100 text-gray-700 border border-gray-200"
        }`}
      >
        {val ? "Active" : "Inactive"}
      </span>
    );
  }

  const strVal = String(val);
  if (c === "status" || c === "attendance_status" || c === "payroll_status") {
    let badgeClass = "bg-gray-100 text-gray-800 border-gray-200";
    if (strVal === "PRESENT" || strVal === "PAID" || strVal === "APPROVED") {
      badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
    } else if (strVal === "ABSENT" || strVal === "REJECTED" || strVal === "CANCELLED") {
      badgeClass = "bg-red-100 text-red-800 border-red-200";
    } else if (strVal === "LATE" || strVal === "PENDING" || strVal === "GENERATED") {
      badgeClass = "bg-amber-100 text-amber-800 border-amber-200";
    } else if (strVal === "MISSING_PUNCH" || strVal === "UNMATCHED" || strVal === "DRAFT") {
      badgeClass = "bg-orange-100 text-orange-800 border-orange-200";
    }
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}>
        {strVal.replaceAll("_", " ")}
      </span>
    );
  }

  if (c === "biometric_id" || c === "employee_code") {
    return <span className="font-mono text-gray-900">{strVal}</span>;
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
  const columns = Object.keys(items[0] ?? {}).filter((c) => c !== "employee_id");
  const summary: Record<string, unknown> = data?.summary ?? {};

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reports &amp; Exports</h1>
        <p className="text-sm text-gray-500">Operational and financial reports in India Standard Time.</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {reports.map(([id, label]) => (
          <button
            key={id}
            onClick={() => switchReport(id)}
            className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
              selected === id
                ? "bg-[#028174] text-white shadow-sm"
                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filter Card */}
      <div className="rounded-lg bg-white p-5 shadow-sm border border-gray-200 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Filter Options</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          {fields[selected].map((field) =>
            field.options ? (
              <label key={field.key} className="text-xs font-medium text-gray-700">
                {field.label}
                <select
                  aria-label={field.label}
                  value={filters[field.key] ?? ""}
                  onChange={(e) => setFilters({ ...filters, [field.key]: e.target.value })}
                  className="block mt-1 w-full border border-gray-300 rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#028174]"
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
              <label key={field.key} className="text-xs font-medium text-gray-700">
                {field.label}
                <input
                  aria-label={field.label}
                  type={field.type ?? "text"}
                  value={filters[field.key] ?? ""}
                  onChange={(e) => setFilters({ ...filters, [field.key]: e.target.value })}
                  className="block mt-1 w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#028174]"
                />
              </label>
            ),
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={apply}
              className="rounded-md bg-[#028174] hover:bg-[#026c61] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors"
            >
              Apply Filters
            </button>
            <button
              onClick={reset}
              disabled={loading}
              className="rounded-md border border-gray-300 bg-white hover:bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
            >
              Clear Filters
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => exportFile("csv")}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors"
            >
              📥 CSV / Excel
            </button>
            <button
              onClick={() => exportFile("pdf")}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors"
            >
              🖨️ Printable PDF
            </button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="rounded-lg bg-white p-12 text-center text-gray-500 shadow-sm border border-gray-200 text-sm">
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
                <div key={key} className="rounded-lg bg-white p-5 shadow-sm border border-gray-200">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {key.replace(/([A-Z])/g, " $1")}
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{String(val)}</div>
                </div>
              ),
            )}
          </div>

          {/* Main Table */}
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm border border-gray-200">
            {items.length === 0 ? (
              <div className="p-12 text-center text-gray-500 text-sm">
                <p className="font-medium text-gray-900">No matching report data.</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting your date range or filter criteria.</p>
              </div>
            ) : (
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <tr>
                    {columns.map((c) => (
                      <th className="px-4 py-3 text-left whitespace-nowrap" key={c}>
                        {c === "employee_code" ? "Employee ID" : c.replaceAll("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {items.map((row, i) => (
                    <tr className="hover:bg-gray-50/80 transition-colors" key={i}>
                      {columns.map((c) => (
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700" key={c}>
                          {renderCell(c, row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {data?.pagination && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-sm text-gray-600">
                Page <span className="font-medium text-gray-900">{data.pagination.page}</span> of{" "}
                <span className="font-medium text-gray-900">{data.pagination.pages}</span> ({data.pagination.total}{" "}
                total records)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-md border border-gray-300 bg-white hover:bg-gray-50 px-3.5 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage(page + 1)}
                  className="rounded-md border border-gray-300 bg-white hover:bg-gray-50 px-3.5 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
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
