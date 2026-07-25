"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { formatShiftTime } from "@/lib/format";
import { ConfirmationModal } from "@/components/confirmation-modal";

export default function ShiftsListPage() {
  const [shifts, setShifts] = useState<Record<string, string | number | boolean>[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<"delete" | "deactivate" | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let url = "/shifts";
    if (activeFilter === "active") url += "?active=true";
    if (activeFilter === "inactive") url += "?active=false";

    apiClient
      .get(url)
      .then((data) => {
        setShifts(data as Record<string, string | number | boolean>[]);
        setSelected([]);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load shifts"))
      .finally(() => setLoading(false));
  }, [activeFilter]);

  const filteredShifts = shifts.filter((s) =>
    String(s.name).toLowerCase().includes(search.toLowerCase())
  );
  const allSelected =
    filteredShifts.length > 0 && filteredShifts.every((shift) => selected.includes(String(shift.id)));

  const toggleSelection = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const refreshShifts = async () => {
    let url = "/shifts";
    if (activeFilter === "active") url += "?active=true";
    if (activeFilter === "inactive") url += "?active=false";
    const data = await apiClient.get(url);
    setShifts(data as Record<string, string | number | boolean>[]);
    setSelected([]);
  };

  const runBulkAction = async () => {
    if (!action || working) return;
    setWorking(true);
    setSuccess("");
    setError("");
    try {
      let count: number;
      if (action === "delete") {
        const result = (await apiClient.delete("/shifts/bulk-unused", {
          body: JSON.stringify({ ids: selected }),
          headers: { "Content-Type": "application/json" },
        })) as { deleted?: number };
        count = result.deleted ?? 0;
      } else {
        const result = (await apiClient.patch("/shifts/bulk-status", {
          ids: selected,
          active: false,
        })) as { updated?: number };
        count = result.updated ?? 0;
      }
      setSuccess(`${action === "delete" ? "Deleted" : "Deactivated"} ${count} shift${count === 1 ? "" : "s"}.`);
      await refreshShifts();
    } catch (err) {
      setError(
        `Unable to ${action === "delete" ? "delete" : "deactivate"} selected shifts: ${
          err instanceof Error ? err.message : "Assigned or historical shifts are protected."
        }`
      );
    } finally {
      setWorking(false);
      setAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Shifts
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage work shift rosters, timing windows, grace periods, and overnight settings.
          </p>
        </div>

        <Link
          href="/shifts/new"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#028174] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#026c61] focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Shift
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
              placeholder="Search by shift name..."
              aria-label="Search shifts by name"
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected([]);
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="shift-status-filter" className="sr-only">Filter by status</label>
            <select
              id="shift-status-filter"
              aria-label="Filter by status"
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm font-medium text-slate-700 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              value={activeFilter}
              onChange={(e) => {
                setLoading(true);
                setActiveFilter(e.target.value as "all" | "active" | "inactive");
                setSelected([]);
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 flex items-center gap-2" role="status">
          <svg className="h-5 w-5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 flex items-center gap-2" role="alert">
          <svg className="h-5 w-5 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        {/* Admin Action Toolbar */}
        <div className="border-b border-slate-200/80 px-6 py-3 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="font-semibold text-slate-700">
            {selected.length} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!selected.length || working}
              onClick={() => setAction("delete")}
              className="min-h-[36px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
            >
              Delete Selected Unused Shifts
            </button>
            <button
              type="button"
              disabled={!selected.length || working}
              onClick={() => setAction("deactivate")}
              className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
            >
              Deactivate Selected Shifts
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
            {(loading || working) && (
              <span className="text-slate-500 font-medium" role="status">
                {working ? "Updating..." : "Loading..."}
              </span>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-6 space-y-3" role="status" aria-label="Loading shifts">
            <span className="sr-only">Loading shifts list...</span>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}

        {/* Desktop Table View */}
        {!loading && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4 w-10">
                    <input
                      aria-label="Select all visible shifts"
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(allSelected ? [] : filteredShifts.map((shift) => String(shift.id)))
                      }
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                  <th className="px-6 py-4">Shift Name</th>
                  <th className="px-6 py-4">Shift Time (IST)</th>
                  <th className="px-6 py-4">Grace (mins)</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShifts.map((shift) => {
                  const shiftIdStr = String(shift.id);
                  const isChecked = selected.includes(shiftIdStr);
                  const isActive = Boolean(shift.active);
                  const isOvernight = Boolean(shift.is_overnight);

                  return (
                    <tr key={shiftIdStr} className={`transition-colors hover:bg-slate-50/60 ${isChecked ? "bg-teal-50/40" : ""}`}>
                      <td className="px-6 py-4">
                        <input
                          aria-label={`Select ${String(shift.name)}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelection(shiftIdStr)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{String(shift.name)}</span>
                          {isOvernight && (
                            <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-200">
                              Overnight
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {formatShiftTime(shift.start_time)} – {formatShiftTime(shift.end_time)}
                      </td>
                      <td className="px-6 py-4 text-slate-700 font-mono font-semibold">
                        {String(shift.grace_minutes)} min
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/shifts/${shiftIdStr}`}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-teal-200/80 bg-teal-50/80 px-3 py-1.5 text-xs font-semibold text-[#028174] transition-colors hover:bg-[#028174] hover:text-white focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
                        >
                          View / Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {filteredShifts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                      No shifts found matching your criteria.
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
            {filteredShifts.map((shift) => {
              const shiftIdStr = String(shift.id);
              const isChecked = selected.includes(shiftIdStr);
              const isActive = Boolean(shift.active);
              const isOvernight = Boolean(shift.is_overnight);

              return (
                <div key={shiftIdStr} className={`p-4 space-y-3 ${isChecked ? "bg-teal-50/40" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={`Select ${String(shift.name)}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelection(shiftIdStr)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900">{String(shift.name)}</h3>
                          {isOvernight && (
                            <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200">
                              Overnight
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs font-medium text-[#028174]">
                          {formatShiftTime(shift.start_time)} – {formatShiftTime(shift.end_time)}
                        </div>
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

                  <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
                    <span>Grace Period: <strong className="text-slate-900">{String(shift.grace_minutes)} min</strong></span>
                    <span>Min Work: <strong className="text-slate-900">{String(shift.minimum_work_minutes ?? 0)} min</strong></span>
                  </div>

                  <div className="pt-1">
                    <Link
                      href={`/shifts/${shiftIdStr}`}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-50 border border-teal-200/80 text-sm font-semibold text-[#028174] transition-colors hover:bg-[#028174] hover:text-white focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
                    >
                      View / Edit Shift
                    </Link>
                  </div>
                </div>
              );
            })}

            {filteredShifts.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">
                No shifts found matching your criteria.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={action !== null}
        pending={working}
        recordName="shifts"
        title={action === "delete" ? "Delete selected unused shifts?" : "Deactivate selected shifts?"}
        message={
          action === "delete"
            ? "Assigned or historical shifts cannot be deleted and will remain protected."
            : "Deactivated shifts remain available in assigned and historical records."
        }
        confirmLabel={action === "delete" ? "Delete Selected" : "Deactivate"}
        onCancel={() => setAction(null)}
        onConfirm={() => void runBulkAction()}
      />
    </div>
  );
}
