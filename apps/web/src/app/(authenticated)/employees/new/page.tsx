"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatShiftTime } from "@/lib/format";

export default function NewEmployeePage() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    employee_code: "",
    biometric_id: "",
    name: "",
    phone: "",
    department: "",
    designation: "",
    joining_date: "",
    weekly_off_day: "",
    shift_id: "",
    effective_from: "",
    salary_type: "MONTHLY",
    salary_amount: "",
    salary_effective_from: "",
    salary_notes: "",
    opening_advance: "",
    opening_advance_date: "",
    opening_advance_notes: "",
  });

  useEffect(() => {
    apiClient
      .get("/shifts?active=true")
      .then((data) => setShifts(data as Record<string, unknown>[]))
      .catch((err) => console.error(err));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const payload: Record<string, unknown> = {
      employee_code: formData.employee_code || undefined,
      biometric_id: parseInt(formData.biometric_id, 10),
      name: formData.name,
      phone: formData.phone || undefined,
      department: formData.department || undefined,
      designation: formData.designation || undefined,
      joining_date: formData.joining_date,
      weekly_off_day: formData.weekly_off_day ? parseInt(formData.weekly_off_day, 10) : undefined,
    };

    if (formData.shift_id && formData.effective_from) {
      payload.initial_shift = {
        shift_id: formData.shift_id,
        effective_from: formData.effective_from,
      };
    } else if (formData.shift_id || formData.effective_from) {
      setError("Both Shift and Effective Date are required if assigning a shift.");
      setLoading(false);
      return;
    }

    if (formData.salary_amount && formData.salary_effective_from) {
      const initialSalary: Record<string, unknown> = {
        salary_type: formData.salary_type,
        effective_from: formData.salary_effective_from,
        notes: formData.salary_notes || undefined,
      };
      if (formData.salary_type === "MONTHLY") initialSalary.monthly_salary = Number(formData.salary_amount);
      if (formData.salary_type === "DAILY") initialSalary.daily_rate = Number(formData.salary_amount);
      if (formData.salary_type === "HOURLY") initialSalary.hourly_rate = Number(formData.salary_amount);
      payload.initial_salary = initialSalary;
    } else if (formData.salary_amount || formData.salary_effective_from) {
      setError("Salary amount and effective date are both required when adding a salary.");
      setLoading(false);
      return;
    }

    if (formData.opening_advance && formData.opening_advance_date) {
      payload.opening_advance = {
        amount: Number(formData.opening_advance),
        transaction_date: formData.opening_advance_date,
        notes: formData.opening_advance_notes || undefined,
      };
    } else if (formData.opening_advance || formData.opening_advance_date) {
      setError("Opening Advance amount and date are both required.");
      setLoading(false);
      return;
    }

    try {
      await apiClient.post("/employees", payload);
      router.push("/employees");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Add New Employee
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Create an employee profile with biometric terminal ID, shift roster, and salary structure.
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 flex items-center gap-3" role="alert">
          <svg className="h-5 w-5 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Information */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">
              Basic Information & Hardware ID
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="employee_code" className="block text-sm font-semibold text-slate-700">
                Employee Code / Custom ID
              </label>
              <input
                id="employee_code"
                type="text"
                name="employee_code"
                value={formData.employee_code}
                onChange={handleChange}
                placeholder="e.g. EMP-101"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
              <p className="mt-1 text-xs text-slate-500">Optional internal reference code.</p>
            </div>

            <div>
              <label htmlFor="biometric_id" className="block text-sm font-semibold text-slate-700">
                Biometric ID <span className="text-rose-500">*</span>
              </label>
              <input
                id="biometric_id"
                type="number"
                name="biometric_id"
                required
                value={formData.biometric_id}
                onChange={handleChange}
                placeholder="e.g. 1001"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
              <p className="mt-1 text-xs text-teal-700 font-medium">
                Must match the User ID enrolled on the biometric device.
              </p>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-slate-700">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. John Doe"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-slate-700">
                Phone Number
              </label>
              <input
                id="phone"
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="e.g. 9876543210"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="department" className="block text-sm font-semibold text-slate-700">
                Department
              </label>
              <input
                id="department"
                type="text"
                name="department"
                value={formData.department}
                onChange={handleChange}
                placeholder="e.g. Housekeeping, Kitchen, Front Desk"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="designation" className="block text-sm font-semibold text-slate-700">
                Designation
              </label>
              <input
                id="designation"
                type="text"
                name="designation"
                value={formData.designation}
                onChange={handleChange}
                placeholder="e.g. Chef, Receptionist, Staff Manager"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="joining_date" className="block text-sm font-semibold text-slate-700">
                Joining Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="joining_date"
                type="date"
                name="joining_date"
                required
                value={formData.joining_date}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="weekly_off_day" className="block text-sm font-semibold text-slate-700">
                Weekly Off Day (0-6)
              </label>
              <input
                id="weekly_off_day"
                type="number"
                min="0"
                max="6"
                name="weekly_off_day"
                value={formData.weekly_off_day}
                onChange={handleChange}
                placeholder="0 = Sunday, 1 = Monday, 6 = Saturday"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Initial Shift Assignment */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">
              Initial Shift Assignment (Optional)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="shift_id" className="block text-sm font-semibold text-slate-700">Select Shift</label>
              <select
                id="shift_id"
                name="shift_id"
                value={formData.shift_id}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <option value="">-- None --</option>
                {shifts.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {String(s.name)} ({formatShiftTime(s.start_time)} – {formatShiftTime(s.end_time)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="effective_from" className="block text-sm font-semibold text-slate-700">Effective From</label>
              <input
                id="effective_from"
                type="date"
                name="effective_from"
                value={formData.effective_from}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Initial Salary */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Initial Salary (Optional)
              </h2>
              <p className="text-xs text-slate-500">Monthly salary is standard. Daily and hourly rates are supported.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="salary_type" className="block text-sm font-semibold text-slate-700">Salary Type</label>
              <select
                id="salary_type"
                name="salary_type"
                value={formData.salary_type}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="DAILY">Daily</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </div>
            <div>
              <label htmlFor="salary_amount" className="block text-sm font-semibold text-slate-700">
                {formData.salary_type === "MONTHLY" ? "Monthly Salary (₹)" : formData.salary_type === "DAILY" ? "Daily Rate (₹)" : "Hourly Rate (₹)"}
              </label>
              <input
                id="salary_amount"
                type="number"
                min="0.01"
                step="0.01"
                name="salary_amount"
                value={formData.salary_amount}
                onChange={handleChange}
                placeholder="e.g. 25000"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
            <div>
              <label htmlFor="salary_effective_from" className="block text-sm font-semibold text-slate-700">Effective Date</label>
              <input
                id="salary_effective_from"
                type="date"
                name="salary_effective_from"
                value={formData.salary_effective_from}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
            <div>
              <label htmlFor="salary_notes" className="block text-sm font-semibold text-slate-700">Notes</label>
              <input
                id="salary_notes"
                name="salary_notes"
                value={formData.salary_notes}
                onChange={handleChange}
                placeholder="Optional notes"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Opening Advance */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">
              Opening Advance (Optional)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="opening_advance" className="block text-sm font-semibold text-slate-700">Opening Advance Amount (₹)</label>
              <input
                id="opening_advance"
                type="number"
                min="0.01"
                step="0.01"
                name="opening_advance"
                value={formData.opening_advance}
                onChange={handleChange}
                placeholder="e.g. 5000"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
            <div>
              <label htmlFor="opening_advance_date" className="block text-sm font-semibold text-slate-700">Opening Advance Date</label>
              <input
                id="opening_advance_date"
                type="date"
                name="opening_advance_date"
                value={formData.opening_advance_date}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="opening_advance_notes" className="block text-sm font-semibold text-slate-700">Notes</label>
              <input
                id="opening_advance_notes"
                name="opening_advance_notes"
                value={formData.opening_advance_notes}
                onChange={handleChange}
                placeholder="Optional notes regarding advance opening balance"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-end gap-3 pt-2">
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
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Saving...
              </>
            ) : (
              "Save Employee"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
