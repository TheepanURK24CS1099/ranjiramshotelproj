"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { formatShiftTime } from "@/lib/format";
import { ConfirmationModal } from "@/components/confirmation-modal";

export default function ShiftsListPage() {
  const [shifts, setShifts] = useState<Record<string, string | number | boolean>[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<"delete" | "deactivate" | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let url = "/shifts";
    if (activeFilter === "active") url += "?active=true";
    if (activeFilter === "inactive") url += "?active=false";

    apiClient.get(url)
      .then((data) => { setShifts(data as Record<string, string | number | boolean>[]); setSelected([]); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load shifts"))
      .finally(() => setLoading(false));
  }, [activeFilter]);

  const filteredShifts = shifts.filter(s => 
    String(s.name).toLowerCase().includes(search.toLowerCase())
  );
  const allSelected = filteredShifts.length > 0 && filteredShifts.every((shift) => selected.includes(String(shift.id)));
  const toggleSelection = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const refreshShifts = async () => {
    let url = "/shifts";
    if (activeFilter === "active") url += "?active=true";
    if (activeFilter === "inactive") url += "?active=false";
    const data = await apiClient.get(url);
    setShifts(data as Record<string, string | number | boolean>[]);
    setSelected([]);
  };
  const runBulkAction = async () => {
    if (!action || working) return;
    setWorking(true); setSuccess(""); setError("");
    try {
      let count: number;
      if (action === "delete") {
        const result = await apiClient.delete("/shifts/bulk-unused", { body: JSON.stringify({ ids: selected }), headers: { "Content-Type": "application/json" } }) as { deleted?: number };
        count = result.deleted ?? 0;
      } else {
        const result = await apiClient.patch("/shifts/bulk-status", { ids: selected, active: false }) as { updated?: number };
        count = result.updated ?? 0;
      }
      setSuccess(`${action === "delete" ? "Deleted" : "Deactivated"} ${count} shift${count === 1 ? "" : "s"}.`);
      await refreshShifts();
    } catch (err) {
      setError(`Unable to ${action === "delete" ? "delete" : "deactivate"} selected shifts: ${err instanceof Error ? err.message : "Assigned or historical shifts are protected."}`);
    } finally {
      setWorking(false);
      setAction(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Shifts</h1>
        <Link href="/shifts/new" className="px-4 py-2 bg-[#028174] text-white rounded hover:bg-[#026c61]">
          Add Shift
        </Link>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6 flex space-x-4">
        <input 
          type="text" 
          placeholder="Search by shift name..." 
          className="border p-2 rounded flex-1"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected([]); }}
        />
        <select 
          className="border p-2 rounded" 
          value={activeFilter} 
          onChange={(e) => { setLoading(true); setActiveFilter(e.target.value as "all" | "active" | "inactive"); setSelected([]); }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {success && <div className="mb-4 rounded bg-green-50 p-3 text-green-800" role="status">{success}</div>}
      {error && <div className="mb-4 rounded bg-red-100 p-3 text-red-800" role="alert">{error}</div>}

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="border-b px-4 py-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-2">{selected.length} selected</span>
          <button disabled={!selected.length || working} className="border rounded px-2 py-1 text-red-700 disabled:opacity-50" onClick={() => setAction("delete")}>Delete Selected Unused Shifts</button>
          <button disabled={!selected.length || working} className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setAction("deactivate")}>Deactivate Selected Shifts</button>
          <button disabled={!selected.length || working} className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setSelected([])}>Clear Selection</button>
          {(loading || working) && <span className="text-gray-500" role="status">{working ? "Updating..." : "Loading..."}</span>}
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4"><input aria-label="Select all visible shifts" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : filteredShifts.map((shift) => String(shift.id)))} /></th>
              <th className="p-4 font-medium text-gray-500">Name</th>
              <th className="p-4 font-medium text-gray-500">Time</th>
              <th className="p-4 font-medium text-gray-500">Grace (mins)</th>
              <th className="p-4 font-medium text-gray-500">Status</th>
              <th className="p-4 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredShifts.map((shift) => (
              <tr key={String(shift.id)} className="border-b hover:bg-gray-50">
                <td className="p-4"><input aria-label={`Select ${String(shift.name)}`} type="checkbox" checked={selected.includes(String(shift.id))} onChange={() => toggleSelection(String(shift.id))} /></td>
                <td className="p-4 font-medium">
                  {shift.name} 
                  {shift.is_overnight && <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">Overnight</span>}
                </td>
                <td className="p-4">{formatShiftTime(shift.start_time)} – {formatShiftTime(shift.end_time)}</td>
                <td className="p-4">{shift.grace_minutes}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 text-xs rounded-full ${shift.active ? "bg-green-100 text-green-800" : "bg-[#FFE3B3] text-[#7C4A03]"}`}>
                    {shift.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="p-4">
                  <Link href={`/shifts/${String(shift.id)}`} className="text-blue-600 hover:underline">
                    View / Edit
                  </Link>
                </td>
              </tr>
            ))}
            {filteredShifts.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">No shifts found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ConfirmationModal
        open={action !== null}
        pending={working}
        recordName="shifts"
        title={action === "delete" ? "Delete selected unused shifts?" : "Deactivate selected shifts?"}
        message={action === "delete" ? "Assigned or historical shifts cannot be deleted and will remain protected." : "Deactivated shifts remain available in assigned and historical records."}
        confirmLabel={action === "delete" ? "Delete Selected" : "Deactivate"}
        onCancel={() => setAction(null)}
        onConfirm={() => void runBulkAction()}
      />
    </div>
  );
}
