"use client";

import { useEffect, useState } from "react";
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
  const [error, setError] = useState("");
  const [device, setDevice] = useState<Record<string, string | boolean | null> | null>(null);

  useEffect(() => {
    Promise.all([apiClient.get("/dashboard/summary"), apiClient.get("/devices")])
      .then(([data, devices]) => { setSummary(data); setDevice((devices as Record<string, string | boolean | null>[])[0] ?? null); })
      .catch(() => setError("Failed to load dashboard data"));
  }, []);

  if (error) return <div className="text-red-500">{error}</div>;
  if (!summary) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard Summary</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded shadow">
          <div className="text-gray-500 text-sm font-medium uppercase">Total Employees</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">{summary.totalEmployees}</div>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <div className="text-gray-500 text-sm font-medium uppercase">Active Employees</div>
          <div className="mt-2 text-3xl font-semibold text-[#1F2937]">{summary.activeEmployees}</div>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <div className="text-gray-500 text-sm font-medium uppercase">Inactive Employees</div>
          <div className="mt-2 text-3xl font-semibold text-[#1F2937]">{summary.inactiveEmployees}</div>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <div className="text-gray-500 text-sm font-medium uppercase">Active Shifts</div>
          <div className="mt-2 text-3xl font-semibold text-[#1F2937]">{summary.activeShifts}</div>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <div className="text-gray-500 text-sm font-medium uppercase">No Current Shift</div>
          <div className="mt-2 text-3xl font-semibold text-[#1F2937]">{summary.employeesWithoutCurrentShift}</div>
        </div>
        <div className="bg-white p-6 rounded shadow"><div className="text-gray-500 text-sm font-medium uppercase">Biometric Device Status</div><div className="mt-2"><span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold text-white ${device?.status === "ONLINE" ? "bg-[#0AB68B]" : "bg-[#DC2626]"}`}>{device?.status ?? "OFFLINE"}</span></div></div>
        <div className="bg-white p-6 rounded shadow"><div className="text-gray-500 text-sm font-medium uppercase">Last Device Sync</div><div className="mt-2 text-xl font-semibold text-[#1F2937]">{formatDateTime(device?.last_seen as string | null)}</div></div>
        <div className="bg-white p-6 rounded shadow"><div className="text-gray-500 text-sm font-medium uppercase">Last Raw Punch Received</div><div className="mt-2 text-xl font-semibold text-[#1F2937]">{formatDateTime(device?.last_raw_punch_received as string | null)}</div></div>
        <div className="bg-white p-6 rounded shadow"><div className="text-gray-500 text-sm font-medium uppercase">Present Today</div><div className="mt-2 text-3xl font-semibold text-[#1F2937]">{summary.presentToday}</div></div>
        <div className="bg-white p-6 rounded shadow"><div className="text-gray-500 text-sm font-medium uppercase">Currently Checked In</div><div className="mt-2 text-3xl font-semibold text-[#1F2937]">{summary.currentlyCheckedIn}</div></div>
        <div className="bg-white p-6 rounded shadow"><div className="text-gray-500 text-sm font-medium uppercase">Missing Punch Out</div><div className="mt-2 text-3xl font-semibold text-[#1F2937]">{summary.missingPunchOut}</div></div>
        <div className="bg-white p-6 rounded shadow"><div className="text-gray-500 text-sm font-medium uppercase">Unmatched Punches</div><div className="mt-2 text-3xl font-semibold text-[#1F2937]">{summary.unmatchedPunches}</div></div>
      </div>
    </div>
  );
}
