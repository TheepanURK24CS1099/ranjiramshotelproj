"use client";

import { useEffect, useMemo, useState } from "react";

import { apiClient } from "@/lib/api-client";
import { formatAttendanceDate, formatTimeOnly, formatWorkingMinutes } from "@/lib/format";
import { ConfirmationModal } from "@/components/confirmation-modal";

type AttendanceStatus = "PRESENT" | "CURRENTLY_CHECKED_IN" | "MISSING_PUNCH" | "UNMATCHED" | "NO_SHIFT";

type AttendanceRow = {
  attendance_key: string;
  attendance_date: string;
  biometric_id: number;
  employee_id: string | null;
  employee_name: string | null;
  employee_code: string;
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
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedExceptions, setSelectedExceptions] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<"delete" | "clear" | "rebuild" | null>(null);
  const [exceptionAction, setExceptionAction] = useState<"resolve" | "delete" | "clear-today" | "clear-date" | null>(null);
  const [working, setWorking] = useState(false);

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
    void apiClient.get("/auth/me").then((user) => setRole(String((user as {role:string}).role)));
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
        setSelected([]);
        setExceptions(exceptionData as AttendanceException[]);
        setSelectedExceptions([]);
      } catch {
        setError("Failed to load attendance records");
      } finally {
        setLoading(false);
      }
    };

    void loadAttendance();
  }, [query, date]);
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.attendance_key));
  const allExceptionsSelected = exceptions.length > 0 && exceptions.every((exception) => selectedExceptions.includes(exception.raw_punch_id));
  const toggle = (id:string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleException = (id:number) => setSelectedExceptions((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const run = async () => { if (!confirm) return; setWorking(true); try { if (confirm === "delete") await apiClient.delete("/attendance/records", { body: JSON.stringify({ ids: selected }), headers: { "Content-Type": "application/json" } }); else if (confirm === "clear") await apiClient.post("/attendance/records/clear-date", { date }); else await apiClient.post("/attendance/rebuild", { date }); setMessage(confirm === "rebuild" ? "Attendance rebuilt from existing raw punches." : "Attendance records updated. Raw biometric punches were preserved."); const data = await apiClient.get(`/attendance?${query}`); setRows(data as AttendanceRow[]); setSelected([]); } catch (e) { setError((e as Error).message); } finally { setWorking(false); setConfirm(null); } };
  const runExceptionAction = async () => {
    if (!exceptionAction) return;
    setWorking(true);
    setError("");
    try {
      const targetDate = exceptionAction === "clear-today" ? istToday : date;
      const targetExceptions = exceptionAction === "clear-today" || exceptionAction === "clear-date"
        ? await apiClient.get(`/attendance/exceptions?date=${encodeURIComponent(targetDate)}`) as AttendanceException[]
        : exceptions;
      const ids = (exceptionAction === "clear-today" || exceptionAction === "clear-date")
        ? targetExceptions.map((exception) => exception.raw_punch_id)
        : selectedExceptions;
      if (!ids.length) {
        setMessage("No attendance exceptions found for that date.");
        return;
      }
      let completed: number;
      if (exceptionAction === "resolve") {
        const result = await apiClient.patch("/attendance/exceptions/resolve", { ids }) as { resolved?: number };
        completed = result.resolved ?? 0;
      } else {
        const result = await apiClient.delete("/attendance/exceptions", { body: JSON.stringify({ ids }), headers: { "Content-Type": "application/json" } }) as { deleted?: number };
        completed = result.deleted ?? 0;
      }
      const label = exceptionAction === "resolve" ? "resolved" : "deleted";
      setMessage(`${completed} of ${ids.length} exception${ids.length === 1 ? "" : "s"} ${label}${completed === ids.length ? "." : `; ${ids.length - completed} skipped because they are protected.`}`);
      const [attendanceData, exceptionData] = await Promise.all([
        apiClient.get(`/attendance?${query}`),
        apiClient.get(`/attendance/exceptions?date=${encodeURIComponent(date)}`),
      ]);
      setRows(attendanceData as AttendanceRow[]);
      setExceptions(exceptionData as AttendanceException[]);
      setSelectedExceptions([]);
    } catch (e) {
      setError((e as Error).message || "Unable to update attendance exceptions");
    } finally {
      setWorking(false);
      setExceptionAction(null);
    }
  };

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
      {message && <div className="p-3 bg-green-50 text-green-800 rounded">{message}</div>}

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Daily Attendance Records</h2>
          <div className="text-sm text-gray-500">{loading ? "Loading..." : `${rows.length} record${rows.length === 1 ? "" : "s"}`}</div>
        </div>
        {role === "ADMIN" && <div className="px-5 py-3 flex flex-wrap gap-2 border-b text-sm"><span className="mr-2 self-center">{selected.length} selected</span><button disabled={!selected.length || working} className="border px-2 py-1 disabled:opacity-50" onClick={() => setConfirm("delete")}>Delete Selected</button><button disabled={working} className="border px-2 py-1" onClick={() => setConfirm("clear")}>Clear Selected Date</button><button disabled={working} className="border border-blue-600 text-blue-700 px-2 py-1" onClick={() => setConfirm("rebuild")}>Rebuild Selected Date</button><button disabled={!selected.length || working} className="border px-2 py-1" onClick={() => setSelected([])}>Clear Selection</button></div>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                {role === "ADMIN" && <th className="p-3"><input aria-label="Select all attendance rows" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.attendance_key))} /></th>}
                <th className="p-3 font-medium text-gray-500">Date</th>
                <th className="p-3 font-medium text-gray-500">Biometric ID</th>
                <th className="p-3 font-medium text-gray-500">Employee</th>
                <th className="p-3 font-medium text-gray-500">Employee ID</th>
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
                  {role === "ADMIN" && <td className="p-3"><input aria-label={`Select ${row.attendance_key}`} type="checkbox" checked={selected.includes(row.attendance_key)} onChange={() => toggle(row.attendance_key)} /></td>}
                  <td className="p-3">{formatAttendanceDate(row.attendance_date)}</td>
                  <td className="p-3 font-medium">{row.biometric_id}</td>
                  <td className="p-3">{row.employee_name ?? "Unmatched"}</td>
                  <td className="p-3">{row.employee_code}</td>
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
                          : row.status === "CURRENTLY_CHECKED_IN"
                            ? "bg-blue-100 text-blue-800"
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
                  <td colSpan={role === "ADMIN" ? 13 : 12} className="p-5 text-center text-gray-500">
                    No attendance records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmationModal open={confirm !== null} pending={working} recordName="attendance records" title={confirm === "rebuild" ? "Rebuild attendance?" : confirm === "clear" ? "Clear attendance for selected date?" : "Delete selected attendance?"} message={confirm === "rebuild" ? "Attendance will be rebuilt from existing raw biometric punches." : "Clear attendance records for the selected date? Raw biometric punches will remain and attendance can be rebuilt."} confirmLabel={confirm === "rebuild" ? "Rebuild" : confirm === "clear" ? "Clear Date" : "Delete Selected"} onCancel={() => setConfirm(null)} onConfirm={() => void run()} />

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Attendance Exceptions</h2>
            <p className="text-sm text-gray-500">Raw punches outside the assigned shift window are preserved here.</p>
          </div>
          <div className="text-sm text-gray-500">{exceptions.length} exception{exceptions.length === 1 ? "" : "s"}</div>
        </div>
        {role === "ADMIN" && <div className="border-b px-5 py-3 flex flex-wrap items-center gap-2 text-sm"><span className="mr-2">{selectedExceptions.length} selected</span><button disabled={!selectedExceptions.length || working} className="border px-2 py-1 disabled:opacity-50" onClick={() => setExceptionAction("resolve")}>Resolve Selected</button><button disabled={!selectedExceptions.length || working} className="border px-2 py-1 text-red-700 disabled:opacity-50" onClick={() => setExceptionAction("delete")}>Delete Selected Safe/Test Exceptions</button><button disabled={working} className="border px-2 py-1 disabled:opacity-50" onClick={() => setExceptionAction("clear-today")}>Clear Today</button><button disabled={working} className="border px-2 py-1 disabled:opacity-50" onClick={() => setExceptionAction("clear-date")}>Clear Selected Date</button><button disabled={!selectedExceptions.length || working} className="border px-2 py-1 disabled:opacity-50" onClick={() => setSelectedExceptions([])}>Clear Selection</button></div>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                {role === "ADMIN" && <th className="p-3"><input aria-label="Select all visible attendance exceptions" type="checkbox" checked={allExceptionsSelected} onChange={() => setSelectedExceptions(allExceptionsSelected ? [] : exceptions.map((exception) => exception.raw_punch_id))} /></th>}
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
                  {role === "ADMIN" && <td className="p-3"><input aria-label={`Select exception ${exception.raw_punch_id}`} type="checkbox" checked={selectedExceptions.includes(exception.raw_punch_id)} onChange={() => toggleException(exception.raw_punch_id)} /></td>}
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
                  <td colSpan={role === "ADMIN" ? 6 : 5} className="p-5 text-center text-gray-500">
                    No attendance exceptions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmationModal open={exceptionAction !== null} pending={working} recordName="attendance exceptions" title={exceptionAction === "resolve" ? "Resolve selected exceptions?" : exceptionAction === "clear-today" ? "Clear today's safe/test exceptions?" : exceptionAction === "clear-date" ? "Clear safe/test exceptions for the selected date?" : "Delete selected safe/test exceptions?"} message={exceptionAction === "resolve" ? "The selected exceptions will be marked as resolved." : "Only safe/test exceptions can be deleted. Protected exceptions will be skipped."} confirmLabel={exceptionAction === "resolve" ? "Resolve Selected" : exceptionAction === "clear-today" ? "Clear Today" : exceptionAction === "clear-date" ? "Clear Selected Date" : "Delete Selected"} onCancel={() => setExceptionAction(null)} onConfirm={() => void runExceptionAction()} />
    </div>
  );
}
