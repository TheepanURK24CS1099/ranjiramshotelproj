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
        const updated = await apiClient.patch(`/holidays/${editingId}`, payload) as Holiday;
        setRows((current) => current.map((holiday) => holiday.id === editingId ? updated : holiday));
        setSuccess(`Holiday “${updated.name}” updated successfully.`);
      } else {
        const created = await apiClient.post("/holidays", payload) as Holiday;
        setRows((current) => [created, ...current].sort((left, right) => right.holiday_date.localeCompare(left.holiday_date)));
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
      const updated = await apiClient.patch(`/holidays/${holiday.id}/status`, { active: !holiday.active }) as Holiday;
      setRows((current) => current.map((row) => row.id === holiday.id ? updated : row));
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
  const runBulk = async () => { if(!bulkAction)return;setDeleting(true);try{const result=bulkAction==="delete"?await apiClient.delete("/holidays/bulk",{body:JSON.stringify({ids:selectedIds}),headers:{"Content-Type":"application/json"}}):await apiClient.patch("/holidays/bulk-status",{ids:selectedIds,active:false});setSuccess(`${bulkAction==="delete"?"Deleted":"Deactivated"} ${(result as {deleted?:number;updated?:number}).deleted??(result as {updated?:number}).updated??0} selected holiday(s).`);setSelectedIds([]);setRows(await apiClient.get("/holidays") as Holiday[]);}catch(e){setError(errorMessage(e,"Unable to update selected holidays."));}finally{setDeleting(false);setBulkAction(null);}};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Holiday Management</h1>

      {success && <div className="rounded bg-green-100 p-3 text-green-800" role="status">{success}</div>}
      {error && <div className="rounded bg-red-100 p-3 text-red-700" role="alert">{error}</div>}

      {isAdmin && (
        <form className="space-y-4 rounded bg-white p-4 shadow" onSubmit={saveHoliday}>
          <h2 className="font-semibold">{editingId ? "Edit Holiday" : "Add Holiday"}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              aria-label="Holiday date"
              type="date"
              required
              value={form.holiday_date}
              onChange={(event) => setForm({ ...form, holiday_date: event.target.value })}
              className="rounded border px-3 py-2"
            />
            <input
              aria-label="Holiday name"
              required
              placeholder="Holiday name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="rounded border px-3 py-2"
            />
          </div>
          <textarea
            aria-label="Holiday description"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className="min-h-20 w-full rounded border px-3 py-2"
          />
          {editingId && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              Active
            </label>
          )}
          <div className="flex gap-3">
            <button disabled={saving} className="rounded bg-[#028174] px-4 py-2 text-white disabled:opacity-60">
              {saving ? "Saving..." : editingId ? "Save Changes" : "Add Holiday"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded border px-4 py-2 text-gray-700">Cancel Edit</button>
            )}
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded bg-white shadow">
        {isAdmin&&<div className="p-3 border-b flex gap-2 text-sm"><span>{selectedIds.length} selected</span><button disabled={!selectedIds.length||deleting} onClick={()=>setBulkAction("delete")} className="border px-2 py-1 disabled:opacity-50">Delete Selected Holidays</button><button disabled={!selectedIds.length||deleting} onClick={()=>setBulkAction("deactivate")} className="border px-2 py-1">Deactivate Selected</button><button disabled={!selectedIds.length} onClick={()=>setSelectedIds([])} className="border px-2 py-1">Clear Selection</button></div>}
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              {isAdmin&&<th className="p-3"><input aria-label="Select all holidays" type="checkbox" checked={rows.length>0&&rows.every(row=>selectedIds.includes(row.id))} onChange={()=>setSelectedIds(rows.every(row=>selectedIds.includes(row.id))?[]:rows.map(row=>row.id))}/></th>}
              <th className="p-3">Date</th>
              <th className="p-3">Name</th>
              <th className="p-3">Description</th>
              <th className="p-3">Status</th>
              {isAdmin && <th className="p-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((holiday) => (
              <tr key={holiday.id} className="border-t">
                {isAdmin&&<td className="p-3"><input aria-label={`Select ${holiday.name}`} type="checkbox" checked={selectedIds.includes(holiday.id)} onChange={()=>setSelectedIds(current=>current.includes(holiday.id)?current.filter(id=>id!==holiday.id):[...current,holiday.id])}/></td>}
                <td className="p-3">{holiday.holiday_date.slice(0, 10)}</td>
                <td className="p-3 font-medium">{holiday.name}</td>
                <td className="p-3 text-gray-600">{holiday.description || "—"}</td>
                <td className="p-3">{holiday.active ? "Active" : "Inactive"}</td>
                {isAdmin && (
                  <td className="p-3">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <button type="button" onClick={() => beginEdit(holiday)} className="text-blue-600 hover:underline">Edit</button>
                      <button type="button" onClick={() => void toggleStatus(holiday)} className="text-[#7C4A03] hover:underline">
                        {holiday.active ? "Deactivate" : "Activate"}
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(holiday)} className="text-red-600 hover:underline">Delete Permanently</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={isAdmin ? 6 : 4} className="p-4 text-center text-gray-500">No holidays found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmationModal
        open={deleteTarget !== null}
        recordName={deleteTarget?.name ?? "holiday"}
        pending={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteHoliday()}
      />
      <ConfirmationModal open={bulkAction!==null} pending={deleting} recordName="selected holidays" title={bulkAction==="delete"?"Delete selected holidays?":"Deactivate selected holidays?"} message={bulkAction==="delete"?"Holidays used by historical attendance will remain protected.":"Deactivated holidays remain in historical records."} confirmLabel={bulkAction==="delete"?"Delete Selected":"Deactivate"} onCancel={()=>setBulkAction(null)} onConfirm={()=>void runBulk()}/>
    </div>
  );
}
