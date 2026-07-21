"use client";

import { useEffect, useMemo, useState } from "react";

import { apiClient } from "@/lib/api-client";
import { formatAttendanceDate, formatTimeOnly, formatWorkingMinutes } from "@/lib/format";

type AttendanceStatus = "PRESENT" | "MISSING_PUNCH" | "UNMATCHED" | "NO_SHIFT";

type AttendanceRow = {
  attendance_key: string;
  attendance_date: string;
  biometric_id: number;
  employee_id: string | null;
  employee_name: string | null;
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

  useEffect(() => {
    Promise.all([
      apiClient.get("/employees?page=1&limit=1000&active=true"),
      apiClient.get("/shifts?active=true"),
    ])
      .then(([employeeResponse, shiftResponse]) => {
        setEmployees((employeeResponse.data as Array<{ id: string; name: string; biometric_id: number }> ) ?? []);
        setShifts((shiftResponse as Array<{ id: string; name: string }>) ?? []);
      })
      .catch(() => setError("Failed to load attendance filters"));
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
        setExceptions(exceptionData as AttendanceException[]);
      } catch {
        setError("Failed to load attendance records");
      } finally {
        setLoading(false);
      }
    };

    void loadAttendance();
  }, [query, date]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-gray-500">Daily attendance records from raw biometric punches.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-4 gap-4">
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Employee</span>
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="w-full border rounded px-3 py-2">
            <option value="">All employees</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} ({employee.biometric_id})
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Shift</span>
          <select value={shiftId} onChange={(event) => setShiftId(event.target.value)} className="w-full border rounded px-3 py-2">
            <option value="">All shifts</option>
            {shifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as AttendanceStatus | "")} className="w-full border rounded px-3 py-2">
            {statusOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="p-3 bg-red-100 text-[#DC2626] rounded">{error}</div>}

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Daily Attendance Records</h2>
          <div className="text-sm text-gray-500">{loading ? "Loading..." : `${rows.length} record${rows.length === 1 ? "" : "s"}`}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 font-medium text-gray-500">Date</th>
                <th className="p-3 font-medium text-gray-500">Biometric ID</th>
                <th className="p-3 font-medium text-gray-500">Employee</th>
                <th className="p-3 font-medium text-gray-500">Shift</th>
                <th className="p-3 font-medium text-gray-500">Punch In</th>
                <th className="p-3 font-medium text-gray-500">Punch Out</th>
                <th className="p-3 font-medium text-gray-500">Punches</th>
                <th className="p-3 font-medium text-gray-500">Late</th>
                <th className="p-3 font-medium text-gray-500">Early Exit</th>
                <th className="p-3 font-medium text-gray-500">Working Hours</th>
                <th className="p-3 font-medium text-gray-500">Note / Reason</th>
                <th className="p-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.attendance_key} className="border-t">
                  <td className="p-3">{formatAttendanceDate(row.attendance_date)}</td>
                  <td className="p-3 font-medium">{row.biometric_id}</td>
                  <td className="p-3">{row.employee_name ?? "Unmatched"}</td>
                  <td className="p-3">{row.shift_name ?? "—"}</td>
                  <td className="p-3">{formatTimeOnly(row.punch_in_at)}</td>
                  <td className="p-3">{formatTimeOnly(row.punch_out_at)}</td>
                  <td className="p-3">{row.raw_punch_count}</td>
                  <td className="p-3">{row.late_minutes}</td>
                  <td className="p-3">{row.early_exit_minutes}</td>
                  <td className="p-3">{formatWorkingMinutes(row.working_minutes)}</td>
                  <td className="p-3">{row.note ?? "—"}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                        row.status === "PRESENT"
                          ? "bg-green-100 text-green-800"
                          : row.status === "MISSING_PUNCH"
                            ? "bg-yellow-100 text-yellow-800"
                            : row.status === "NO_SHIFT"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {row.status.replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-5 text-center text-gray-500">
                    No attendance records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Attendance Exceptions</h2>
            <p className="text-sm text-gray-500">Raw punches outside the assigned shift window are preserved here.</p>
          </div>
          <div className="text-sm text-gray-500">{exceptions.length} exception{exceptions.length === 1 ? "" : "s"}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 font-medium text-gray-500">Employee</th>
                <th className="p-3 font-medium text-gray-500">Biometric ID</th>
                <th className="p-3 font-medium text-gray-500">Shift</th>
                <th className="p-3 font-medium text-gray-500">Punch Time</th>
                <th className="p-3 font-medium text-gray-500">Note / Exception</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((exception) => (
                <tr key={exception.raw_punch_id} className="border-t">
                  <td className="p-3">{exception.employee_name}</td>
                  <td className="p-3 font-medium">{exception.biometric_id}</td>
                  <td className="p-3">{exception.shift_name}</td>
                  <td className="p-3">{formatTimeOnly(exception.punch_time)}</td>
                  <td className="p-3">
                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">OUT OF SHIFT</span>
                    <span className="ml-2 text-gray-600">{exception.message}</span>
                  </td>
                </tr>
              ))}
              {!loading && exceptions.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-5 text-center text-gray-500">
                    No attendance exceptions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
