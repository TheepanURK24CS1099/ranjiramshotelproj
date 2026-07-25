"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";

export default function NewShiftPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    start_time: "09:00",
    end_time: "17:00",
    grace_minutes: "0",
    minimum_work_minutes: "0",
    early_exit_tolerance_minutes: "0",
    checkin_before_minutes: "0",
    checkout_after_minutes: "360",
    weekly_off_days: [] as number[],
    is_overnight: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const payload = {
      ...formData,
      grace_minutes: parseInt(formData.grace_minutes, 10) || 0,
      minimum_work_minutes: parseInt(formData.minimum_work_minutes, 10) || 0,
      early_exit_tolerance_minutes: parseInt(formData.early_exit_tolerance_minutes, 10) || 0,
      checkin_before_minutes: parseInt(formData.checkin_before_minutes, 10) || 0,
      checkout_after_minutes: parseInt(formData.checkout_after_minutes, 10) || 0,
    };

    try {
      await apiClient.post("/shifts", payload);
      router.push("/shifts");
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Add New Shift
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Define a new work shift schedule, time boundaries, grace periods, and weekly off settings.
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
        {/* Section 1: Shift Identity & Timing */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">
              Shift Identity & Time Schedule
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-slate-700">
                Shift Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Morning Shift, Night Duty, Front Desk A"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="start_time" className="block text-sm font-semibold text-slate-700">
                  Start Time (HH:MM) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="start_time"
                  type="time"
                  name="start_time"
                  required
                  value={formData.start_time}
                  onChange={handleChange}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </div>

              <div>
                <label htmlFor="end_time" className="block text-sm font-semibold text-slate-700">
                  End Time (HH:MM) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="end_time"
                  type="time"
                  name="end_time"
                  required
                  value={formData.end_time}
                  onChange={handleChange}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="is_overnight"
                name="is_overnight"
                checked={formData.is_overnight}
                onChange={handleChange}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="is_overnight" className="text-sm font-medium text-slate-900">
                Is Overnight Shift <span className="text-xs text-slate-500">(Shift ends on the next calendar day)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Section 2: Grace Period & Tolerances */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">
              Grace Period & Attendance Tolerances
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="grace_minutes" className="block text-sm font-semibold text-slate-700">Grace Minutes</label>
              <input
                id="grace_minutes"
                type="number"
                min="0"
                name="grace_minutes"
                value={formData.grace_minutes}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
              <p className="mt-1 text-xs text-slate-500">Late arrival tolerance before marking late.</p>
            </div>

            <div>
              <label htmlFor="minimum_work_minutes" className="block text-sm font-semibold text-slate-700">Min Work Minutes</label>
              <input
                id="minimum_work_minutes"
                type="number"
                min="0"
                name="minimum_work_minutes"
                value={formData.minimum_work_minutes}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
              <p className="mt-1 text-xs text-slate-500">Minimum required working minutes for full shift.</p>
            </div>

            <div>
              <label htmlFor="early_exit_tolerance_minutes" className="block text-sm font-semibold text-slate-700">
                Early-exit tolerance (minutes)
              </label>
              <input
                id="early_exit_tolerance_minutes"
                type="number"
                min="0"
                name="early_exit_tolerance_minutes"
                value={formData.early_exit_tolerance_minutes}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="checkin_before_minutes" className="block text-sm font-semibold text-slate-700">
                Allowed check-in before (minutes)
              </label>
              <input
                id="checkin_before_minutes"
                type="number"
                min="0"
                name="checkin_before_minutes"
                value={formData.checkin_before_minutes}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="checkout_after_minutes" className="block text-sm font-semibold text-slate-700">
                Allowed checkout after (minutes)
              </label>
              <input
                id="checkout_after_minutes"
                type="number"
                min="0"
                name="checkout_after_minutes"
                value={formData.checkout_after_minutes}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Weekly Off Days */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">
              Weekly-Off Days
            </h2>
          </div>

          <fieldset>
            <legend className="sr-only">Weekly-off days</legend>
            <div className="flex flex-wrap gap-4 pt-1">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => (
                <label key={day} className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.weekly_off_days.includes(index)}
                    onChange={() =>
                      setFormData({
                        ...formData,
                        weekly_off_days: formData.weekly_off_days.includes(index)
                          ? formData.weekly_off_days.filter((x) => x !== index)
                          : [...formData.weekly_off_days, index],
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
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
            {loading ? "Saving..." : "Save Shift"}
          </button>
        </div>
      </form>
    </div>
  );
}
