"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState<Record<string, string | number | boolean | null> | null>(null);

  const [shiftId, setShiftId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [assignmentError, setAssignmentError] = useState("");

  useEffect(() => {
    Promise.all([
      apiClient.get(`/employees/${id}`),
      apiClient.get(`/employees/${id}/shift-assignments`),
      apiClient.get(`/shifts?active=true`),
    ]).then(([empData, assignData, shiftsData]) => {
      // Date formatting for input type="date"
      if (empData.joining_date) {
        empData.joining_date = empData.joining_date.substring(0, 10);
      }
      setEmployee(empData);
      setAssignments(assignData as Record<string, unknown>[]);
      setShifts(shiftsData as Record<string, unknown>[]);
    }).catch((err: unknown) => {
      setError("Failed to load data");
      console.error(err);
    });
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!employee) return;
    setEmployee({ ...employee, [e.target.name]: e.target.value });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setError("");
    setLoading(true);

    const payload = {
      biometric_id: parseInt(String(employee.biometric_id), 10),
      name: employee.name,
      phone: employee.phone || null,
      department: employee.department || null,
      designation: employee.designation || null,
      joining_date: employee.joining_date,
      weekly_off_day: employee.weekly_off_day !== "" && employee.weekly_off_day !== null ? parseInt(String(employee.weekly_off_day), 10) : null,
    };

    try {
      await apiClient.patch(`/employees/${id}`, payload);
      alert("Updated successfully!");
    } catch (err: unknown) {
      if (err instanceof ApiError) setError(err.message);
      else setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!employee) return;
    if (!confirm(`Are you sure you want to ${employee.active ? "deactivate" : "activate"} this employee?`)) return;
    try {
      await apiClient.patch(`/employees/${id}/status`, { active: !employee.active });
      setEmployee({ ...employee, active: !employee.active });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        alert(err.message || "Failed to update status");
      } else {
        alert("Failed to update status");
      }
    }
  };

  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignmentError("");
    try {
      await apiClient.post(`/employees/${id}/shift-assignments`, {
        shift_id: shiftId,
        effective_from: effectiveFrom,
      });
      const assignData = await apiClient.get(`/employees/${id}/shift-assignments`);
      setAssignments(assignData);
      setShiftId("");
      setEffectiveFrom("");
    } catch (err: unknown) {
      if (err instanceof ApiError) setAssignmentError(err.message);
      else setAssignmentError("An unexpected error occurred");
    }
  };

  if (error && !employee) return <div className="p-6 text-red-500">{error}</div>;
  if (!employee) return <div className="p-6">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded shadow">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Edit Employee: {employee.name}</h1>
          <button 
            onClick={handleToggleStatus}
            className={`px-4 py-2 text-white rounded ${employee.active ? "bg-[#DC2626] hover:bg-[#B91C1C]" : "bg-[#0AB68B] hover:bg-[#089774]"}`}
          >
            {employee.active ? "Deactivate Employee" : "Activate Employee"}
          </button>
        </div>

        {error && <div className="mb-4 p-3 text-red-600 bg-red-100 rounded">{error}</div>}

        <form onSubmit={handleUpdate} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Biometric ID *</label>
              <input type="number" name="biometric_id" required value={String(employee.biometric_id)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Name *</label>
              <input type="text" name="name" required value={String(employee.name)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input type="text" name="phone" value={employee.phone ? String(employee.phone) : ""} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Department</label>
              <input type="text" name="department" value={employee.department ? String(employee.department) : ""} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Designation</label>
              <input type="text" name="designation" value={employee.designation ? String(employee.designation) : ""} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Joining Date *</label>
              <input type="date" name="joining_date" required value={String(employee.joining_date)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Weekly Off Day (0-6)</label>
              <input type="number" min="0" max="6" name="weekly_off_day" value={employee.weekly_off_day === null ? "" : String(employee.weekly_off_day)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
            </div>
          </div>
          <div className="flex justify-end space-x-4">
            <button type="button" onClick={() => router.back()} className="px-4 py-2 bg-white text-[#1F2937] border border-[#CBD5E1] rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-[#028174] text-white rounded hover:bg-[#026c61] disabled:bg-[#E5E7EB] disabled:text-[#64748B] disabled:opacity-100 disabled:border-transparent">
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-4">Shift Assignments</h2>
        
        <form onSubmit={handleAssignShift} className="mb-6 p-4 border rounded bg-gray-50">
          <h3 className="font-medium mb-3">Assign New Shift</h3>
          {assignmentError && <div className="mb-3 p-2 text-sm text-red-600 bg-red-100 rounded">{assignmentError}</div>}
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Shift</label>
              <select required value={shiftId} onChange={e => setShiftId(e.target.value)} className="w-full px-3 py-2 mt-1 border rounded bg-white">
                <option value="">Select a shift...</option>
                {shifts.map(s => <option key={String(s.id)} value={String(s.id)}>{String(s.name)} ({String(s.start_time)} - {String(s.end_time)})</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Effective From</label>
              <input type="date" required value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} className="w-full px-3 py-2 mt-1 border rounded bg-white" />
            </div>
            <button type="submit" className="px-4 py-2 bg-[#028174] text-white rounded hover:bg-[#026c61]">Assign</button>
          </div>
        </form>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-3 font-medium text-gray-500">Shift Name</th>
              <th className="p-3 font-medium text-gray-500">Effective From</th>
              <th className="p-3 font-medium text-gray-500">Effective To</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a: Record<string, unknown>, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{String(a.shift_name)}</td>
                <td className="p-3">{new Date(String(a.effective_from)).toLocaleDateString()}</td>
                <td className="p-3">{a.effective_to ? new Date(String(a.effective_to)).toLocaleDateString() : "Present"}</td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan={3} className="p-3 text-center text-gray-500">No shift assignments.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
