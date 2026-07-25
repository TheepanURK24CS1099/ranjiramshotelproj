"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

export default function EmployeesListPage() {
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchEmployees = async () => {
    setLoading(true);
    setError("");
    try {
      let url = `/employees?page=${page}&limit=20`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (activeFilter === "active") url += "&active=true";
      if (activeFilter === "inactive") url += "&active=false";

      const data = await apiClient.get(url);
      setEmployees(data.data as Record<string, unknown>[]);
      setTotal(data.total as number);
    } catch (e: unknown) {
      console.error(e);
      setError("Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch data on mount and filter changes
    fetchEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeFilter, search]);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Employees
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage staff profiles, department assignments, biometric IDs, and active status.
          </p>
        </div>

        <Link
          href="/employees/new"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#028174] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#026c61] focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add Employee
        </Link>
      </div>

      {/* Search and Filters Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by name, ID, phone..."
              aria-label="Search employees by name, ID, or phone"
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="employee-status-filter" className="sr-only">Filter by status</label>
            <select
              id="employee-status-filter"
              aria-label="Filter by status"
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm font-medium text-slate-700 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value as "all" | "active" | "inactive");
                setPage(1);
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 flex items-center justify-between" role="alert">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchEmployees}
            className="text-xs font-bold text-rose-800 underline hover:text-rose-900 focus-visible:outline-2 focus-visible:outline-rose-600"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4" role="status" aria-label="Loading employees list">
          <span className="sr-only">Loading employees...</span>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {/* Main Content Area */}
      {!loading && !error && (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Employee ID / Biometric ID</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => {
                  const empId = String(emp.id);
                  const isActive = Boolean(emp.active);
                  const code = emp.employee_code ? String(emp.employee_code) : "—";
                  const bioId = String(emp.biometric_id);

                  return (
                    <tr key={empId} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-900">{code}</span>
                          <span className="text-slate-300">/</span>
                          <span className="font-mono text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60" title="Biometric ID">
                            Bio #{bioId}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                        {String(emp.name)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {emp.department ? String(emp.department) : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                            isActive
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-amber-50 text-amber-800 border-amber-300"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <Link
                          href={`/employees/${empId}`}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-teal-200/80 bg-teal-50/80 px-3 py-1.5 text-xs font-semibold text-[#028174] transition-colors hover:bg-[#028174] hover:text-white focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
                        >
                          View / Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {employees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                      No employees found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (768px and below) */}
          <div className="block md:hidden divide-y divide-slate-100">
            {employees.map((emp) => {
              const empId = String(emp.id);
              const isActive = Boolean(emp.active);
              const code = emp.employee_code ? String(emp.employee_code) : "—";
              const bioId = String(emp.biometric_id);

              return (
                <div key={empId} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{String(emp.name)}</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                        <span>Code: <strong className="text-slate-700">{code}</strong></span>
                        <span>•</span>
                        <span>Bio ID: <strong className="text-teal-700">#{bioId}</strong></span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${
                        isActive
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : "bg-amber-50 text-amber-800 border-amber-300"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600">
                    <span className="font-medium text-slate-500">Department:</span>{" "}
                    {emp.department ? String(emp.department) : "—"}
                  </div>

                  <div className="pt-2">
                    <Link
                      href={`/employees/${empId}`}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-50 border border-teal-200/80 text-sm font-semibold text-[#028174] transition-colors hover:bg-[#028174] hover:text-white focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
                    >
                      View / Edit Employee
                    </Link>
                  </div>
                </div>
              );
            })}

            {employees.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">
                No employees found matching your criteria.
              </div>
            )}
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200/80 bg-slate-50/50 px-6 py-4 text-sm text-slate-600">
            <div>
              Showing <span className="font-semibold text-slate-900">{employees.length}</span> of{" "}
              <span className="font-semibold text-slate-900">{total}</span> employees
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={employees.length < 20}
                onClick={() => setPage((p) => p + 1)}
                className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
