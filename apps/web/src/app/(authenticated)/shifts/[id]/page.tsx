"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { ConfirmationModal } from "@/components/confirmation-modal";

export default function EditShiftPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [shift, setShift] = useState<Record<string, string | number | boolean | number[]> | null>(null);

  useEffect(() => {
    Promise.all([apiClient.get(`/shifts/${id}`), apiClient.get("/auth/me")])
      .then(([data, userData]) => {
        setShift(data as Record<string, string | number | boolean | number[]>);
        setIsAdmin((userData as { role?: string }).role === "ADMIN");
      })
      .catch((err: unknown) => {
        setError("Failed to load shift data");
        console.error(err);
      });
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!shift) return;
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setShift({ ...shift, [e.target.name]: value });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return;
    setError("");
    setSuccess("");
    setLoading(true);

    const payload = {
      name: shift.name,
      start_time: shift.start_time,
      end_time: shift.end_time,
      grace_minutes: parseInt(String(shift.grace_minutes), 10),
      minimum_work_minutes: parseInt(String(shift.minimum_work_minutes), 10),
      early_exit_tolerance_minutes: parseInt(String(shift.early_exit_tolerance_minutes), 10) || 0,
      checkin_before_minutes: parseInt(String(shift.checkin_before_minutes), 10) || 0,
      checkout_after_minutes: parseInt(String(shift.checkout_after_minutes), 10) || 0,
      weekly_off_days: Array.isArray(shift.weekly_off_days) ? shift.weekly_off_days : [],
      is_overnight: Boolean(shift.is_overnight),
      active: Boolean(shift.active),
    };

    try {
      await apiClient.patch(`/shifts/${id}`, payload);
      setSuccess("Shift updated successfully.");
    } catch (err: unknown) {
      if (err instanceof ApiError) setError(err.message);
      else setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!shift) return;
    setError("");
    setSuccess("");
    try {
      const updated = await apiClient.patch(`/shifts/${id}/status`, { active: !shift.active });
      setShift(updated as Record<string, string | number | boolean | number[]>);
      setSuccess(`Shift ${shift.active ? "deactivated" : "activated"} successfully.`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!shift || !isAdmin) return;
    setDeleting(true);
    setError("");
    setSuccess("");
    try {
      await apiClient.delete(`/shifts/${id}`);
      setShowDeleteConfirmation(false);
      router.replace("/shifts");
      router.refresh();
    } catch (err: unknown) {
      setShowDeleteConfirmation(false);
      setError(err instanceof ApiError ? err.message : "Failed to delete shift. Deactivate the shift instead.");
    } finally {
      setDeleting(false);
    }
  };

  if (error && !shift) return <div className="p-6 text-rose-600 font-semibold">{error}</div>;
  if (!shift) return <div className="p-6 text-slate-600 font-medium">Loading shift details...</div>;

  const isActive = Boolean(shift.active);
  const isOvernight = Boolean(shift.is_overnight);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Banner Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Edit Shift: {String(shift.name)}
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
              {isOvernight && (
                <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-200">
                  Overnight
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Shift window: <strong className="text-slate-900">{String(shift.start_time)} – {String(shift.end_time)}</strong>
            </p>
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
              {isActive ? "Deactivate Shift" : "Activate Shift"}
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirmation(true)}
                className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
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

        <form onSubmit={handleUpdate} className="mt-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="edit_shift_name" className="block text-sm font-semibold text-slate-700">
                Shift Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit_shift_name"
                type="text"
                name="name"
                required
                value={String(shift.name)}
                onChange={handleChange}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="edit_start_time" className="block text-sm font-semibold text-slate-700">
                  Start Time (HH:MM) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="edit_start_time"
                  type="time"
                  name="start_time"
                  required
                  value={String(shift.start_time)}
                  onChange={handleChange}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </div>

              <div>
                <label htmlFor="edit_end_time" className="block text-sm font-semibold text-slate-700">
                  End Time (HH:MM) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="edit_end_time"
                  type="time"
                  name="end_time"
                  required
                  value={String(shift.end_time)}
                  onChange={handleChange}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </div>

              <div>
                <label htmlFor="edit_grace_minutes" className="block text-sm font-semibold text-slate-700">Grace Minutes</label>
                <input
                  id="edit_grace_minutes"
                  type="number"
                  min="0"
                  name="grace_minutes"
                  value={String(shift.grace_minutes)}
                  onChange={handleChange}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </div>

              <div>
                <label htmlFor="edit_minimum_work_minutes" className="block text-sm font-semibold text-slate-700">Min Work Minutes</label>
                <input
                  id="edit_minimum_work_minutes"
                  type="number"
                  min="0"
                  name="minimum_work_minutes"
                  value={String(shift.minimum_work_minutes)}
                  onChange={handleChange}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </div>

              <div>
                <label htmlFor="edit_early_exit_tolerance_minutes" className="block text-sm font-semibold text-slate-700">
                  Early-exit tolerance (minutes)
                </label>
                <input
                  id="edit_early_exit_tolerance_minutes"
                  type="number"
                  min="0"
                  name="early_exit_tolerance_minutes"
                  value={String(shift.early_exit_tolerance_minutes ?? 0)}
                  onChange={handleChange}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </div>

              <div>
                <label htmlFor="edit_checkin_before_minutes" className="block text-sm font-semibold text-slate-700">
                  Allowed check-in before (minutes)
                </label>
                <input
                  id="edit_checkin_before_minutes"
                  type="number"
                  min="0"
                  name="checkin_before_minutes"
                  value={String(shift.checkin_before_minutes ?? 0)}
                  onChange={handleChange}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="edit_checkout_after_minutes" className="block text-sm font-semibold text-slate-700">
                  Allowed checkout after (minutes)
                </label>
                <input
                  id="edit_checkout_after_minutes"
                  type="number"
                  min="0"
                  name="checkout_after_minutes"
                  value={String(shift.checkout_after_minutes ?? 360)}
                  onChange={handleChange}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
                />
              </div>
            </div>
          </div>

          <fieldset className="border-t border-slate-100 pt-4">
            <legend className="block text-sm font-semibold text-slate-700 mb-2">Weekly-Off Days</legend>
            <div className="flex flex-wrap gap-3">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => {
                const days = Array.isArray(shift.weekly_off_days) ? shift.weekly_off_days : [];
                const isOff = days.includes(index);
                return (
                  <label key={day} className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isOff}
                      onChange={() =>
                        setShift({
                          ...shift,
                          weekly_off_days: isOff ? days.filter((x) => x !== index) : [...days, index],
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    {day}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
            <input
              type="checkbox"
              id="edit_is_overnight"
              name="is_overnight"
              checked={Boolean(shift.is_overnight)}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="edit_is_overnight" className="text-sm font-medium text-slate-900">
              Is Overnight Shift <span className="text-xs text-slate-500">(ends on next calendar day)</span>
            </label>
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

      <ConfirmationModal
        open={showDeleteConfirmation}
        recordName={String(shift.name)}
        pending={deleting}
        onCancel={() => setShowDeleteConfirmation(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
