"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";

interface SessionFormState {
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

export default function NewShiftPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    weekly_off_days: [] as number[],
    active: true,
  });

  const [sessions, setSessions] = useState<SessionFormState[]>([
    {
      session_number: 1,
      start_time: "09:00",
      end_time: "17:00",
      grace_minutes: "0",
      minimum_work_minutes: "0",
      early_exit_tolerance_minutes: "0",
      checkin_before_minutes: "0",
      checkout_after_minutes: "60",
      crosses_midnight: false,
    },
  ]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
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
      name: formData.name,
      start_time: firstSession.start_time,
      end_time: lastSession.end_time,
      grace_minutes: firstSession.grace_minutes,
      minimum_work_minutes: formattedSessions.reduce((sum, s) => sum + s.minimum_work_minutes, 0),
      early_exit_tolerance_minutes: lastSession.early_exit_tolerance_minutes,
      checkin_before_minutes: firstSession.checkin_before_minutes,
      checkout_after_minutes: lastSession.checkout_after_minutes,
      weekly_off_days: formData.weekly_off_days,
      is_overnight: formattedSessions.some((s) => s.crosses_midnight),
      active: formData.active,
      sessions: formattedSessions,
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Add New Shift
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Define a new work shift schedule with 1, 2, or 3 working sessions in a day.
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
        {/* Section 1: Shift Identity */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">Shift Overview</h2>
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
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Split Shift Front Desk, Morning Duty, Triple Session Shift"
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition-colors focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
            />
          </div>
        </div>

        {/* Section 2: Shift Sessions */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h2 className="text-base font-bold text-slate-900">Shift Sessions (1 to 3)</h2>
                <p className="text-xs text-slate-500">Configure separate working sessions in the same day. Breaks between sessions are excluded from total work time.</p>
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
                      id={`crosses-${session.session_number}`}
                      checked={session.crosses_midnight}
                      onChange={(e) => handleSessionChange(index, "crosses_midnight", e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <label htmlFor={`crosses-${session.session_number}`} className="text-xs font-semibold text-slate-900 cursor-pointer">
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
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
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
