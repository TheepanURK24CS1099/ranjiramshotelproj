"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatShiftTime } from "@/lib/format";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { EmployeeFinancials } from "@/components/employee-financials";

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [employee, setEmployee] = useState<Record<string, string | number | boolean | null> | null>(null);

  const [shiftId, setShiftId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [assignmentError, setAssignmentError] = useState("");

  useEffect(() => {
    Promise.all([
      apiClient.get(`/employees/${id}`),
      apiClient.get(`/employees/${id}/shift-assignments`),
      apiClient.get(`/shifts?active=true`),
      apiClient.get("/auth/me"),
    ])
      .then(([empData, assignData, shiftsData, userData]) => {
        if (empData.joining_date) {
          empData.joining_date = String(empData.joining_date).substring(0, 10);
        }
        setEmployee(empData);
        setAssignments(assignData as Record<string, unknown>[]);
        setShifts(shiftsData as Record<string, unknown>[]);
        setIsAdmin((userData as { role?: string }).role === "ADMIN");
      })
      .catch((err: unknown) => {
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
    setSuccess("");
    setLoading(true);

    const payload = {
      employee_code: employee.employee_code || null,
      biometric_id: parseInt(String(employee.biometric_id), 10),
      name: employee.name,
      phone: employee.phone || null,
      department: employee.department || null,
      designation: employee.designation || null,
      joining_date: employee.joining_date,
      weekly_off_day:
        employee.weekly_off_day !== "" && employee.weekly_off_day !== null
          ? parseInt(String(employee.weekly_off_day), 10)
          : null,
    };

    try {
      await apiClient.patch(`/employees/${id}`, payload);
      setSuccess("Employee updated successfully.");
    } catch (err: unknown) {
      if (err instanceof ApiError) setError(err.message);
      else setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!employee) return;
    setError("");
    setSuccess("");
    try {
      const updated = await apiClient.patch(`/employees/${id}/status`, { active: !employee.active });
      setEmployee(updated as Record<string, string | number | boolean | null>);
      setSuccess(`Employee ${employee.active ? "deactivated" : "activated"} successfully.`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!employee || !isAdmin) return;
    setDeleting(true);
    setError("");
    setSuccess("");
    try {
      await apiClient.delete(`/employees/${id}`);
      setShowDeleteConfirmation(false);
      router.replace("/employees");
      router.refresh();
    } catch (err: unknown) {
      setShowDeleteConfirmation(false);
      setError(err instanceof ApiError ? err.message : "Failed to delete employee. Deactivate the employee instead.");
    } finally {
      setDeleting(false);
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
      setAssignments(assignData as Record<string, unknown>[]);
      setShiftId("");
      setEffectiveFrom("");
    } catch (err: unknown) {
      if (err instanceof ApiError) setAssignmentError(err.message);
      else setAssignmentError("An unexpected error occurred");
    }
  };

  if (error && !employee) return <div className="p-6 text-red-500 font-semibold">{error}</div>;
  if (!employee) return <div className="p-6 text-slate-600 font-medium">Loading employee details...</div>;

  const isActive = Boolean(employee.active);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Top Banner Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#028174] font-bold text-lg">
              {String(employee.name ?? "E")[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {String(employee.name)}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                    isActive
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : "bg-amber-50 text-amber-800 border-amber-300"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                  {isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Employee Code: <strong className="text-slate-700">{employee.employee_code ? String(employee.employee_code) : "—"}</strong> | Biometric ID: <strong className="text-teal-700">#{String(employee.biometric_id)}</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleToggleStatus}
              className={`min-h-[44px] px-4 py-2 text-xs font-bold rounded-xl text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isActive
                  ? "bg-rose-600 hover:bg-rose-700 focus-visible:outline-rose-600"
                  : "bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600"
              }`}
            >
              {isActive ? "Deactivate Employee" : "Activate Employee"}
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirmation(true)}
                className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:text-rose-800 transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
              >
                Delete Permanently
              </button>
            )}
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-medium text-rose-700 flex items-center gap-2" role="alert">
            <svg className="h-5 w-5 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-800 flex items-center gap-2" role="status">
            <svg className="h-5 w-5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{success}</span>
          </div>
        )}

        {/* Edit Main Form */}
        <form onSubmit={handleUpdate} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="edit_employee_code" className="block text-sm font-semibold text-slate-700">
                Employee Code / Custom ID
              </label>
              <input
                id="edit_employee_code"
                type="text"
                name="employee_code"
                value={employee.employee_code ? String(employee.employee_code) : ""}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="edit_biometric_id" className="block text-sm font-semibold text-slate-700">
                Biometric ID <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit_biometric_id"
                type="number"
                name="biometric_id"
                required
                value={String(employee.biometric_id)}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
              <p className="mt-1 text-xs text-teal-700 font-medium">
                Must match the User ID enrolled on the biometric hardware terminal.
              </p>
            </div>

            <div>
              <label htmlFor="edit_name" className="block text-sm font-semibold text-slate-700">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit_name"
                type="text"
                name="name"
                required
                value={String(employee.name)}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="edit_phone" className="block text-sm font-semibold text-slate-700">
                Phone Number
              </label>
              <input
                id="edit_phone"
                type="text"
                name="phone"
                value={employee.phone ? String(employee.phone) : ""}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="edit_department" className="block text-sm font-semibold text-slate-700">
                Department
              </label>
              <input
                id="edit_department"
                type="text"
                name="department"
                value={employee.department ? String(employee.department) : ""}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="edit_designation" className="block text-sm font-semibold text-slate-700">
                Designation
              </label>
              <input
                id="edit_designation"
                type="text"
                name="designation"
                value={employee.designation ? String(employee.designation) : ""}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="edit_joining_date" className="block text-sm font-semibold text-slate-700">
                Joining Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit_joining_date"
                type="date"
                name="joining_date"
                required
                value={String(employee.joining_date)}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="edit_weekly_off_day" className="block text-sm font-semibold text-slate-700">
                Weekly Off Day (0-6)
              </label>
              <input
                id="edit_weekly_off_day"
                type="number"
                min="0"
                max="6"
                name="weekly_off_day"
                value={employee.weekly_off_day === null ? "" : String(employee.weekly_off_day)}
                onChange={handleChange}
                placeholder="0 = Sunday, 1 = Monday..."
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#028174] px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#026c61] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Shift Assignments Section */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-base font-bold text-slate-900">Shift Assignments</h2>
        </div>

        {/* Form to Assign New Shift */}
        <form onSubmit={handleAssignShift} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Assign New Shift</h3>

          {assignmentError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700" role="alert">
              {assignmentError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="assign_shift_id" className="block text-sm font-semibold text-slate-700">Shift</label>
              <select
                id="assign_shift_id"
                required
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <option value="">Select a shift...</option>
                {shifts.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {String(s.name)} ({formatShiftTime(s.start_time)} – {formatShiftTime(s.end_time)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="assign_effective_from" className="block text-sm font-semibold text-slate-700">Effective From</label>
              <input
                id="assign_effective_from"
                type="date"
                required
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-[#028174] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#026c61] focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
              >
                Assign Shift
              </button>
            </div>
          </div>
        </form>

        {/* Shift Assignment History Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="p-3.5">Shift Name</th>
                <th className="p-3.5">Effective From</th>
                <th className="p-3.5">Effective To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.map((a: Record<string, unknown>, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <td className="p-3.5 font-semibold text-slate-900">{String(a.shift_name)}</td>
                  <td className="p-3.5 text-slate-600">{new Date(String(a.effective_from)).toLocaleDateString()}</td>
                  <td className="p-3.5 text-slate-600">
                    {a.effective_to ? new Date(String(a.effective_to)).toLocaleDateString() : "Present"}
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-slate-500 text-xs">
                    No shift assignments recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Details Section */}
      <EmployeeFinancials employeeId={id} />

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={showDeleteConfirmation}
        recordName={String(employee.name)}
        pending={deleting}
        onCancel={() => setShowDeleteConfirmation(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
