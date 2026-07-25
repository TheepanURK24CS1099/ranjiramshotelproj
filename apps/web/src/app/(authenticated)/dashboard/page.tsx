"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

interface DashboardSummary {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  activeShifts: number;
  employeesWithoutCurrentShift: number;
  presentToday: number;
  currentlyCheckedIn: number;
  missingPunchOut: number;
  unmatchedPunches: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [device, setDevice] = useState<Record<string, string | boolean | null> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const [summaryRes, devicesRes] = await Promise.all([
        apiClient.get("/dashboard/summary"),
        apiClient.get("/devices"),
      ]);

      setSummary(summaryRes as DashboardSummary);
      setDevice((devicesRes as Record<string, string | boolean | null>[])[0] ?? null);
    } catch {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch dashboard data on mount
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize clock on mount
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formattedTime = now
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "medium",
        hour12: true,
        timeZone: "Asia/Kolkata",
      }).format(now)
    : "—";

  if (error && !summary) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center" role="alert">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Dashboard Unavailable</h2>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <button
          type="button"
          onClick={() => fetchDashboardData()}
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#028174] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#026c61] focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Try Again
        </button>
      </div>
    );
  }

  if (loading && !summary) {
    return (
      <div className="space-y-8" role="status" aria-label="Loading dashboard data">
        <span className="sr-only">Loading dashboard metrics...</span>

        {/* Header Skeleton */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-8 w-56 animate-pulse rounded-md bg-slate-200" />
            <div className="h-4 w-80 animate-pulse rounded-md bg-slate-200" />
          </div>
          <div className="h-16 w-64 animate-pulse rounded-xl bg-slate-200" />
        </div>

        {/* Quick Actions Skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-32 animate-pulse rounded-md bg-slate-200" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </div>
        </div>

        {/* Grid Cards Skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-44 animate-pulse rounded-md bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="h-5 w-48 animate-pulse rounded-md bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        </div>

        <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  }

  const isDeviceOnline = device?.status === "ONLINE";
  const deviceName = (device?.name as string) || (device?.device_code as string) || "Biometric Terminal";

  return (
    <div className="space-y-8">
      {/* Top Page Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Dashboard Summary
            </h1>
            {refreshing && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 border border-teal-200">
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Updating...
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Real-time overview of hotel staff, attendance tracking, and biometric devices.
          </p>
        </div>

        {/* Current Time IST Card */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs sm:justify-end">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-[#028174]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Current Time (IST)
              </div>
              <div className="mt-0.5 text-sm font-bold text-slate-900 sm:text-base">
                {formattedTime}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            aria-label="Refresh dashboard data"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2 disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <svg
              className={`h-4 w-4 ${refreshing ? "animate-spin text-teal-600" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick Actions Section */}
      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="quick-actions-heading" className="text-base font-semibold text-slate-900">
            Quick Actions
          </h2>
          <span className="text-xs text-slate-500">Shortcuts to main workflows</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Link
            href="/employees/new"
            className="group flex min-h-[48px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition-all duration-150 hover:border-teal-300 hover:bg-teal-50/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-[#028174] group-hover:bg-[#028174] group-hover:text-white transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate group-hover:text-[#028174]">
                Add Employee
              </div>
              <div className="text-[11px] text-slate-500 truncate">Create record</div>
            </div>
          </Link>

          <Link
            href="/attendance"
            className="group flex min-h-[48px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition-all duration-150 hover:border-sky-300 hover:bg-sky-50/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 group-hover:bg-sky-600 group-hover:text-white transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate group-hover:text-sky-700">
                View Attendance
              </div>
              <div className="text-[11px] text-slate-500 truncate">Logs & punch history</div>
            </div>
          </Link>

          <Link
            href="/reports"
            className="group flex min-h-[48px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate group-hover:text-indigo-700">
                View Reports
              </div>
              <div className="text-[11px] text-slate-500 truncate">Export & analytics</div>
            </div>
          </Link>

          <Link
            href="/shifts"
            className="group flex min-h-[48px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition-all duration-150 hover:border-purple-300 hover:bg-purple-50/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate group-hover:text-purple-700">
                Manage Shifts
              </div>
              <div className="text-[11px] text-slate-500 truncate">Rosters & timing</div>
            </div>
          </Link>

          <Link
            href="/devices"
            className="group flex min-h-[48px] items-center gap-3 col-span-2 sm:col-span-1 rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition-all duration-150 hover:border-slate-400 hover:bg-slate-50/80 hover:shadow-md focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-800 group-hover:text-white transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate group-hover:text-slate-900">
                View Device
              </div>
              <div className="text-[11px] text-slate-500 truncate">Hardware status</div>
            </div>
          </Link>
        </div>
      </section>

      {/* Attendance Summary Section */}
      <section aria-labelledby="attendance-summary-heading" className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2">
          <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 id="attendance-summary-heading" className="text-base font-semibold text-slate-900">
            Attendance Summary
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Present Today */}
          <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Present Today
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-105 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                {summary?.presentToday ?? 0}
              </span>
              <span className="text-xs text-slate-500">Staff marked present</span>
            </div>
          </div>

          {/* Currently Checked In */}
          <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Currently Checked In
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-[#028174] group-hover:scale-105 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                {summary?.currentlyCheckedIn ?? 0}
              </span>
              <span className="text-xs text-slate-500">Active on floor</span>
            </div>
          </div>

          {/* Missing Punch Out */}
          <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Missing Punch Out
              </span>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl group-hover:scale-105 transition-transform ${
                (summary?.missingPunchOut ?? 0) > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-500"
              }`}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                {summary?.missingPunchOut ?? 0}
              </span>
              {(summary?.missingPunchOut ?? 0) > 0 ? (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                  Needs Attention
                </span>
              ) : (
                <span className="text-xs text-slate-500">All shifts closed</span>
              )}
            </div>
          </div>

          {/* Unmatched Punches */}
          <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Unmatched Punches
              </span>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl group-hover:scale-105 transition-transform ${
                (summary?.unmatchedPunches ?? 0) > 0
                  ? "bg-orange-100 text-orange-700"
                  : "bg-slate-100 text-slate-500"
              }`}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                {summary?.unmatchedPunches ?? 0}
              </span>
              {(summary?.unmatchedPunches ?? 0) > 0 ? (
                <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-800 border border-orange-200">
                  Unassigned
                </span>
              ) : (
                <span className="text-xs text-slate-500">None pending</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Employee Summary Section */}
      <section aria-labelledby="employee-summary-heading" className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2">
          <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h2 id="employee-summary-heading" className="text-base font-semibold text-slate-900">
            Employee & Shift Summary
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* Total Employees */}
          <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Employees
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:scale-105 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-extrabold tracking-tight text-slate-900">
                {summary?.totalEmployees ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">Registered in system</p>
            </div>
          </div>

          {/* Active Employees */}
          <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Employees
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 group-hover:scale-105 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-extrabold tracking-tight text-[#1F2937]">
                {summary?.activeEmployees ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">Active duty status</p>
            </div>
          </div>

          {/* Inactive Employees */}
          <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Inactive Employees
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:scale-105 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-extrabold tracking-tight text-[#1F2937]">
                {summary?.inactiveEmployees ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">Disabled or former</p>
            </div>
          </div>

          {/* Active Shifts */}
          <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Shifts
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 group-hover:scale-105 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-extrabold tracking-tight text-[#1F2937]">
                {summary?.activeShifts ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">Configured shift schedules</p>
            </div>
          </div>

          {/* No Current Shift */}
          <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                No Current Shift
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 group-hover:scale-105 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-extrabold tracking-tight text-[#1F2937]">
                {summary?.employeesWithoutCurrentShift ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">Unassigned staff</p>
            </div>
          </div>
        </div>
      </section>

      {/* Biometric Device Status Section */}
      <section aria-labelledby="device-status-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <h2 id="device-status-heading" className="text-base font-semibold text-slate-900">
              Biometric Device Status
            </h2>
          </div>
          <Link
            href="/devices"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#028174] hover:text-[#026c61] hover:underline focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
          >
            Manage Devices
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                isDeviceOnline ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              }`}>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <div>
                <div className="text-base font-bold text-slate-900">{deviceName}</div>
                <div className="text-xs text-slate-500">ADMS Push Communication Terminal</div>
              </div>
            </div>

            {/* Status Badge */}
            <div>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold border ${
                  isDeviceOnline
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-rose-50 text-rose-800 border-rose-300"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isDeviceOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} aria-hidden="true" />
                {device?.status ?? "OFFLINE"}
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50/80 p-4 border border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Biometric Device Status
              </div>
              <div className="mt-2 text-base font-bold text-slate-900">
                {device?.status ?? "OFFLINE"}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/80 p-4 border border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Last Device Sync
              </div>
              <div className="mt-2 text-sm font-semibold text-[#1F2937]">
                {formatDateTime(device?.last_seen as string | null)}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/80 p-4 border border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Last Raw Punch Received
              </div>
              <div className="mt-2 text-sm font-semibold text-[#1F2937]">
                {formatDateTime(device?.last_raw_punch_received as string | null)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
