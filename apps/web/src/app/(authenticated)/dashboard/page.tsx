"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface DashboardSummary {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  activeShifts: number;
  employeesWithoutCurrentShift: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient.get("/dashboard/summary")
      .then((data) => setSummary(data))
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
          <div className="mt-2 text-3xl font-semibold text-green-600">{summary.activeEmployees}</div>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <div className="text-gray-500 text-sm font-medium uppercase">Inactive Employees</div>
          <div className="mt-2 text-3xl font-semibold text-red-600">{summary.inactiveEmployees}</div>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <div className="text-gray-500 text-sm font-medium uppercase">Active Shifts</div>
          <div className="mt-2 text-3xl font-semibold text-blue-600">{summary.activeShifts}</div>
        </div>
        <div className="bg-white p-6 rounded shadow">
          <div className="text-gray-500 text-sm font-medium uppercase">No Current Shift</div>
          <div className="mt-2 text-3xl font-semibold text-orange-600">{summary.employeesWithoutCurrentShift}</div>
        </div>
      </div>
    </div>
  );
}
