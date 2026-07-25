"use client";

import { useEffect, useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { apiClient, ApiError } from "@/lib/api-client";

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  description: string | null;
  active: boolean;
}

interface HolidayForm {
  holiday_date: string;
  name: string;
  description: string;
  active: boolean;
}

const emptyForm: HolidayForm = {
  holiday_date: "",
  name: "",
  description: "",
  active: true,
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export default function HolidaysPage() {
  const [rows, setRows] = useState<Holiday[]>([]);
  const [form, setForm] = useState<HolidayForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"delete" | "deactivate" | null>(null);

  useEffect(() => {
    void Promise.all([apiClient.get("/holidays"), apiClient.get("/auth/me")])
      .then(([holidays, user]) => {
        setRows(holidays as Holiday[]);
        setIsAdmin((user as { role?: string }).role === "ADMIN");
      })
      .catch((loadError: unknown) => setError(errorMessage(loadError, "Failed to load holidays")));
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const beginEdit = (holiday: Holiday) => {
    setError("");
    setSuccess("");
    setEditingId(holiday.id);
    setForm({
      holiday_date: holiday.holiday_date.slice(0, 10),
      name: holiday.name,
      description: holiday.description ?? "",
      active: holiday.active,
    });
  };

  const saveHoliday = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    const payload = {
      ...form,
      description: form.description.trim() || null,
    };

    try {
      if (editingId) {
        const updated = (await apiClient.patch(`/holidays/${editingId}`, payload)) as Holiday;
        setRows((current) => current.map((holiday) => (holiday.id === editingId ? updated : holiday)));
        setSuccess(`Holiday “${updated.name}” updated successfully.`);
      } else {
        const created = (await apiClient.post("/holidays", payload)) as Holiday;
        setRows((current) =>
          [created, ...current].sort((left, right) => right.holiday_date.localeCompare(left.holiday_date))
        );
        setSuccess(`Holiday “${created.name}” added successfully.`);
      }
      resetForm();
    } catch (saveError) {
      setError(errorMessage(saveError, "Failed to save holiday"));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (holiday: Holiday) => {
    setError("");
    setSuccess("");
    try {
      const updated = (await apiClient.patch(`/holidays/${holiday.id}/status`, {
        active: !holiday.active,
      })) as Holiday;
      setRows((current) => current.map((row) => (row.id === holiday.id ? updated : row)));
      if (editingId === holiday.id) setForm((current) => ({ ...current, active: updated.active }));
      setSuccess(`Holiday “${holiday.name}” ${updated.active ? "activated" : "deactivated"} successfully.`);
    } catch (statusError) {
      setError(errorMessage(statusError, "Failed to update holiday status"));
    }
  };

  const deleteHoliday = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    setSuccess("");
    try {
      await apiClient.delete(`/holidays/${deleteTarget.id}`);
      setRows((current) => current.filter((holiday) => holiday.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) resetForm();
      setSuccess(`Holiday “${deleteTarget.name}” deleted permanently.`);
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(errorMessage(deleteError, "Failed to delete holiday. Deactivate the holiday instead."));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const runBulk = async () => {
    if (!bulkAction) return;
    setDeleting(true);
    try {
      const result =
        bulkAction === "delete"
          ? await apiClient.delete("/holidays/bulk", {
              body: JSON.stringify({ ids: selectedIds }),
              headers: { "Content-Type": "application/json" },
            })
          : await apiClient.patch("/holidays/bulk-status", { ids: selectedIds, active: false });

      setSuccess(
        `${bulkAction === "delete" ? "Deleted" : "Deactivated"} ${
          (result as { deleted?: number; updated?: number }).deleted ??
          (result as { updated?: number }).updated ??
          0
        } selected holiday(s).`
      );
      setSelectedIds([]);
      setRows((await apiClient.get("/holidays")) as Holiday[]);
    } catch (e) {
      setError(errorMessage(e, "Unable to update selected holidays."));
    } finally {
      setDeleting(false);
      setBulkAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Holiday Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure official hotel holidays and calendar observances for staff rosters.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 flex items-center gap-2" role="status">
          <svg className="h-5 w-5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 flex items-center gap-2" role="alert">
          <svg className="h-5 w-5 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Admin Add/Edit Form Card */}
      {isAdmin && (
        <form onSubmit={saveHoliday} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">
              {editingId ? "Edit Holiday" : "Add Holiday"}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="holiday_date" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Holiday Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="holiday_date"
                aria-label="Holiday date"
                type="date"
                required
                value={form.holiday_date}
                onChange={(event) => setForm({ ...form, holiday_date: event.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="holiday_name" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Holiday Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="holiday_name"
                aria-label="Holiday name"
                required
                type="text"
                placeholder="e.g. Independence Day, Diwali"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="holiday_description" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Description (Optional)
              </label>
              <textarea
                id="holiday_description"
                aria-label="Holiday description"
                placeholder="Description or notes regarding the holiday..."
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="min-h-20 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
          </div>

          {editingId && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="holiday_active"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="holiday_active" className="text-sm font-medium text-slate-900">
                Active Holiday
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-600"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#028174] px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#026c61] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Add Holiday"}
            </button>
          </div>
        </form>
      )}

      {/* Main Table Container */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        {/* Admin Action Toolbar */}
        {isAdmin && (
          <div className="border-b border-slate-200/80 px-6 py-3 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="font-semibold text-slate-700">
              {selectedIds.length} selected
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!selectedIds.length || deleting}
                onClick={() => setBulkAction("delete")}
                className="min-h-[36px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
              >
                Delete Selected Holidays
              </button>
              <button
                type="button"
                disabled={!selectedIds.length || deleting}
                onClick={() => setBulkAction("deactivate")}
                className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
              >
                Deactivate Selected
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setSelectedIds([])}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-slate-600"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        )}

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {isAdmin && (
                  <th className="px-6 py-4 w-10">
                    <input
                      aria-label="Select all holidays"
                      type="checkbox"
                      checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))}
                      onChange={() =>
                        setSelectedIds(rows.every((row) => selectedIds.includes(row.id)) ? [] : rows.map((row) => row.id))
                      }
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                )}
                <th className="px-6 py-4">Holiday Date</th>
                <th className="px-6 py-4">Holiday Name</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Status</th>
                {isAdmin && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((holiday) => {
                const isChecked = selectedIds.includes(holiday.id);
                const isActive = Boolean(holiday.active);

                return (
                  <tr key={holiday.id} className={`transition-colors hover:bg-slate-50/60 ${isChecked ? "bg-teal-50/40" : ""}`}>
                    {isAdmin && (
                      <td className="px-6 py-4">
                        <input
                          aria-label={`Select ${holiday.name}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setSelectedIds((current) =>
                              current.includes(holiday.id)
                                ? current.filter((id) => id !== holiday.id)
                                : [...current, holiday.id]
                            )
                          }
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {holiday.holiday_date.slice(0, 10)}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">{holiday.name}</td>
                    <td className="px-6 py-4 text-slate-600">{holiday.description || "—"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                          isActive
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-amber-50 text-amber-800 border-amber-300"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                        {isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => beginEdit(holiday)}
                            className="text-[#028174] hover:underline focus-visible:outline-2 focus-visible:outline-teal-600"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleStatus(holiday)}
                            className="text-[#7C4A03] hover:underline focus-visible:outline-2 focus-visible:outline-amber-600"
                          >
                            {holiday.active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(holiday)}
                            className="text-rose-600 hover:underline focus-visible:outline-2 focus-visible:outline-rose-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 4} className="px-6 py-12 text-center text-sm text-slate-500">
                    No holidays recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (768px and below) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {rows.map((holiday) => {
            const isChecked = selectedIds.includes(holiday.id);
            const isActive = Boolean(holiday.active);

            return (
              <div key={holiday.id} className={`p-4 space-y-3 ${isChecked ? "bg-teal-50/40" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <input
                        aria-label={`Select ${holiday.name}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          setSelectedIds((current) =>
                            current.includes(holiday.id)
                              ? current.filter((id) => id !== holiday.id)
                              : [...current, holiday.id]
                          )
                        }
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                    )}
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{holiday.name}</h3>
                      <div className="text-xs font-semibold text-teal-700">
                        Date: {holiday.holiday_date.slice(0, 10)}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${
                      isActive
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-amber-50 text-amber-800 border-amber-300"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {holiday.description && (
                  <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {holiday.description}
                  </div>
                )}

                {isAdmin && (
                  <div className="flex items-center justify-end gap-3 pt-2 text-xs font-semibold border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => beginEdit(holiday)}
                      className="text-[#028174] hover:underline focus-visible:outline-2 focus-visible:outline-teal-600"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleStatus(holiday)}
                      className="text-[#7C4A03] hover:underline focus-visible:outline-2 focus-visible:outline-amber-600"
                    >
                      {holiday.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(holiday)}
                      className="text-rose-600 hover:underline focus-visible:outline-2 focus-visible:outline-rose-600"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No holidays recorded.
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modals */}
      <ConfirmationModal
        open={deleteTarget !== null}
        recordName={deleteTarget?.name ?? "holiday"}
        pending={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteHoliday()}
      />
      <ConfirmationModal
        open={bulkAction !== null}
        pending={deleting}
        recordName="selected holidays"
        title={bulkAction === "delete" ? "Delete selected holidays?" : "Deactivate selected holidays?"}
        message={
          bulkAction === "delete"
            ? "Holidays used by historical attendance will remain protected."
            : "Deactivated holidays remain in historical records."
        }
        confirmLabel={bulkAction === "delete" ? "Delete Selected" : "Deactivate"}
        onCancel={() => setBulkAction(null)}
        onConfirm={() => void runBulk()}
      />
    </div>
  );
}
