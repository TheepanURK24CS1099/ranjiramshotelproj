"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { ConfirmationModal } from "@/components/confirmation-modal";

interface SessionFormState {
  id?: string;
  session_number: number;
  start_time: string;
  end_time: string;
  grace_minutes: string;
  minimum_work_minutes: string;
  early_exit_tolerance_minutes: string;
  checkin_before_minutes: string;
  checkout_after_minutes: string;
  crosses_midnight: boolean;
}

interface ShiftData {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  minimum_work_minutes: number;
  early_exit_tolerance_minutes: number;
  checkin_before_minutes: number;
  checkout_after_minutes: number;
  weekly_off_days: number[];
  is_overnight: boolean;
  active: boolean;
  sessions?: SessionFormState[];
}

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
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [sessions, setSessions] = useState<SessionFormState[]>([]);

  useEffect(() => {
    Promise.all([apiClient.get(`/shifts/${id}`), apiClient.get("/auth/me")])
      .then(([data, userData]) => {
        const sData = data as ShiftData;
        setShift(sData);
        setIsAdmin((userData as { role?: string }).role === "ADMIN");

        if (sData.sessions && sData.sessions.length > 0) {
          const formatted = sData.sessions.map((s) => ({
            id: s.id,
            session_number: s.session_number,
            start_time: s.start_time,
            end_time: s.end_time,
            grace_minutes: String(s.grace_minutes ?? 0),
            minimum_work_minutes: String(s.minimum_work_minutes ?? 0),
            early_exit_tolerance_minutes: String(s.early_exit_tolerance_minutes ?? 0),
            checkin_before_minutes: String(s.checkin_before_minutes ?? 0),
            checkout_after_minutes: String(s.checkout_after_minutes ?? 60),
            crosses_midnight: Boolean(s.crosses_midnight),
          }));
          setSessions(formatted);
        } else {
          setSessions([
            {
              session_number: 1,
              start_time: sData.start_time || "09:00",
              end_time: sData.end_time || "17:00",
              grace_minutes: String(sData.grace_minutes ?? 0),
              minimum_work_minutes: String(sData.minimum_work_minutes ?? 0),
              early_exit_tolerance_minutes: String(sData.early_exit_tolerance_minutes ?? 0),
              checkin_before_minutes: String(sData.checkin_before_minutes ?? 0),
              checkout_after_minutes: String(sData.checkout_after_minutes ?? 60),
              crosses_midnight: Boolean(sData.is_overnight),
            },
          ]);
        }
      })
      .catch((err: unknown) => {
        setError("Failed to load shift data");
        console.error(err);
      });
  }, [id]);

  const handleAddSession = () => {
    if (sessions.length >= 3) return;
    const nextNum = sessions.length + 1;
    const defaults: Record<number, { start: string; end: string }> = {
      2: { start: "18:00", end: "22:00" },
      3: { start: "22:30", end: "02:00" },
    };
    const times = defaults[nextNum] ?? { start: "09:00", end: "17:00" };

    setSessions([
      ...sessions,
      {
        session_number: nextNum,
        start_time: times.start,
        end_time: times.end,
        grace_minutes: "0",
        minimum_work_minutes: "0",
        early_exit_tolerance_minutes: "0",
        checkin_before_minutes: "0",
        checkout_after_minutes: "60",
        crosses_midnight: false,
      },
    ]);
  };

  const handleRemoveSession = (index: number) => {
    if (sessions.length <= 1) return;
    const updated = sessions.filter((_, i) => i !== index);
    const reindexed = updated.map((s, i) => ({ ...s, session_number: i + 1 }));
    setSessions(reindexed);
  };

  const handleMoveSession = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sessions.length) return;
    const updated = [...sessions];
    const temp = updated[index]!;
    updated[index] = updated[targetIndex]!;
    updated[targetIndex] = temp;
    const reindexed = updated.map((s, i) => ({ ...s, session_number: i + 1 }));
    setSessions(reindexed);
  };

  const handleSessionChange = (index: number, field: keyof SessionFormState, value: string | boolean) => {
    const updated = [...sessions];
    updated[index] = { ...updated[index]!, [field]: value };
    setSessions(updated);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return;
    setError("");
    setSuccess("");
    setLoading(true);

    const formattedSessions = sessions.map((s) => ({
      session_number: s.session_number,
      start_time: s.start_time,
      end_time: s.end_time,
      grace_minutes: parseInt(s.grace_minutes, 10) || 0,
      minimum_work_minutes: parseInt(s.minimum_work_minutes, 10) || 0,
      early_exit_tolerance_minutes: parseInt(s.early_exit_tolerance_minutes, 10) || 0,
      checkin_before_minutes: parseInt(s.checkin_before_minutes, 10) || 0,
      checkout_after_minutes: parseInt(s.checkout_after_minutes, 10) || 0,
      crosses_midnight: s.crosses_midnight,
      active: true,
    }));

    const firstSession = formattedSessions[0]!;
    const lastSession = formattedSessions[formattedSessions.length - 1]!;

    const payload = {
      name: shift.name,
      start_time: firstSession.start_time,
      end_time: lastSession.end_time,
      grace_minutes: firstSession.grace_minutes,
      minimum_work_minutes: formattedSessions.reduce((sum, s) => sum + s.minimum_work_minutes, 0),
      early_exit_tolerance_minutes: lastSession.early_exit_tolerance_minutes,
      checkin_before_minutes: firstSession.checkin_before_minutes,
      checkout_after_minutes: lastSession.checkout_after_minutes,
      weekly_off_days: Array.isArray(shift.weekly_off_days) ? shift.weekly_off_days : [],
      is_overnight: formattedSessions.some((s) => s.crosses_midnight),
      active: Boolean(shift.active),
      sessions: formattedSessions,
    };

    try {
      const updated = await apiClient.patch(`/shifts/${id}`, payload);
      setShift(updated as ShiftData);
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
      setShift(updated as ShiftData);
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Edit Shift: {shift.name}
              </h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-amber-500"}`} />
                {isActive ? "ACTIVE" : "INACTIVE"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">ID: {shift.id}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleStatus}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold shadow-xs transition-colors ${
                isActive
                  ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              {isActive ? "Deactivate Shift" : "Activate Shift"}
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirmation(true)}
                className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 shadow-xs transition-colors hover:bg-rose-100"
              >
                Delete Shift
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Banners */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 flex items-center gap-3">
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700 flex items-center gap-3">
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleUpdate} className="space-y-6">
        {/* Section 1: Name */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">Shift Name</h2>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-slate-700">
              Shift Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              name="name"
              required
              value={shift.name}
              onChange={(e) => setShift({ ...shift, name: e.target.value })}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-teal-600"
            />
          </div>
        </div>

        {/* Section 2: Shift Sessions */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h2 className="text-base font-bold text-slate-900">Shift Sessions (1 to 3)</h2>
                <p className="text-xs text-slate-500">Configure separate working sessions in the same day.</p>
              </div>
            </div>
            {sessions.length < 3 && (
              <button
                type="button"
                onClick={handleAddSession}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-[#028174] text-[#028174] bg-teal-50/50 hover:bg-teal-100/50 text-sm font-semibold transition-colors"
              >
                + Add Session
              </button>
            )}
          </div>

          <div className="space-y-6">
            {sessions.map((session, index) => (
              <div
                key={`session-${session.session_number}`}
                className="rounded-xl border border-slate-200 bg-slate-50/40 p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                  <span className="text-sm font-bold text-[#028174]">
                    Session {session.session_number}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveSession(index, "up")}
                      className="min-h-[44px] min-w-[44px] px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      ↑ Up
                    </button>
                    <button
                      type="button"
                      disabled={index === sessions.length - 1}
                      onClick={() => handleMoveSession(index, "down")}
                      className="min-h-[44px] min-w-[44px] px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      ↓ Down
                    </button>
                    {sessions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSession(index)}
                        className="min-h-[44px] min-w-[44px] px-2.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Start Time *</label>
                    <input
                      type="time"
                      required
                      value={session.start_time}
                      onChange={(e) => handleSessionChange(index, "start_time", e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">End Time *</label>
                    <input
                      type="time"
                      required
                      value={session.end_time}
                      onChange={(e) => handleSessionChange(index, "end_time", e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Grace (mins)</label>
                    <input
                      type="number"
                      min="0"
                      value={session.grace_minutes}
                      onChange={(e) => handleSessionChange(index, "grace_minutes", e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Min Work (mins)</label>
                    <input
                      type="number"
                      min="0"
                      value={session.minimum_work_minutes}
                      onChange={(e) => handleSessionChange(index, "minimum_work_minutes", e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Early Exit Tol (mins)</label>
                    <input
                      type="number"
                      min="0"
                      value={session.early_exit_tolerance_minutes}
                      onChange={(e) => handleSessionChange(index, "early_exit_tolerance_minutes", e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Checkin Before (mins)</label>
                    <input
                      type="number"
                      min="0"
                      value={session.checkin_before_minutes}
                      onChange={(e) => handleSessionChange(index, "checkin_before_minutes", e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Checkout After (mins)</label>
                    <input
                      type="number"
                      min="0"
                      value={session.checkout_after_minutes}
                      onChange={(e) => handleSessionChange(index, "checkout_after_minutes", e.target.value)}
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-teal-600"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id={`edit-crosses-${session.session_number}`}
                      checked={session.crosses_midnight}
                      onChange={(e) => handleSessionChange(index, "crosses_midnight", e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <label htmlFor={`edit-crosses-${session.session_number}`} className="text-xs font-semibold text-slate-900 cursor-pointer">
                      Overnight Session <span className="font-normal text-slate-500">(Session ends next day)</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Weekly Off Days */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">Weekly-Off Days</h2>
          </div>

          <fieldset>
            <legend className="sr-only">Weekly-off days</legend>
            <div className="flex flex-wrap gap-4 pt-1">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => (
                <label key={day} className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={Array.isArray(shift.weekly_off_days) && shift.weekly_off_days.includes(index)}
                    onChange={() => {
                      const current = Array.isArray(shift.weekly_off_days) ? shift.weekly_off_days : [];
                      const updated = current.includes(index)
                        ? current.filter((x) => x !== index)
                        : [...current, index];
                      setShift({ ...shift, weekly_off_days: updated });
                    }}
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
            {loading ? "Updating..." : "Update Shift"}
          </button>
        </div>
      </form>

      {showDeleteConfirmation && (
        <ConfirmationModal
          open={showDeleteConfirmation}
          recordName={shift.name}
          title="Delete Shift"
          message={`Are you sure you want to delete shift "${shift.name}"? This action cannot be undone.`}
          confirmLabel={deleting ? "Deleting..." : "Delete"}
          pending={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirmation(false)}
        />
      )}
    </div>
  );
}
