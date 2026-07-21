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

  if (error && !shift) return <div className="p-6 text-red-500">{error}</div>;
  if (!shift) return <div className="p-6">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded shadow">
      <div className="flex flex-wrap justify-between gap-3 items-center mb-6">
        <h1 className="text-2xl font-semibold">Edit Shift: {shift.name}</h1>
        <div className="flex gap-3">
          <button
            onClick={handleToggleStatus}
            className={`px-4 py-2 text-white rounded ${shift.active ? "bg-[#DC2626] hover:bg-[#B91C1C]" : "bg-[#0AB68B] hover:bg-[#089774]"}`}
          >
            {shift.active ? "Deactivate Shift" : "Activate Shift"}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirmation(true)}
              className="rounded border border-red-600 px-4 py-2 text-red-600 hover:bg-red-50"
            >
              Delete Permanently
            </button>
          )}
        </div>
      </div>
      
      {error && <div className="mb-4 p-3 text-red-600 bg-red-100 rounded">{error}</div>}
      {success && <div className="mb-4 p-3 text-green-800 bg-green-100 rounded" role="status">{success}</div>}

      <form onSubmit={handleUpdate} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Shift Name *</label>
          <input type="text" name="name" required value={String(shift.name)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Time (HH:MM) *</label>
            <input type="time" name="start_time" required value={String(shift.start_time)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End Time (HH:MM) *</label>
            <input type="time" name="end_time" required value={String(shift.end_time)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Grace Minutes</label>
            <input type="number" min="0" name="grace_minutes" value={String(shift.grace_minutes)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Min Work Minutes</label>
            <input type="number" min="0" name="minimum_work_minutes" value={String(shift.minimum_work_minutes)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div><label className="block text-sm font-medium text-gray-700">Early-exit tolerance</label><input type="number" min="0" name="early_exit_tolerance_minutes" value={String(shift.early_exit_tolerance_minutes ?? 0)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" /></div>
          <div><label className="block text-sm font-medium text-gray-700">Allowed check-in before</label><input type="number" min="0" name="checkin_before_minutes" value={String(shift.checkin_before_minutes ?? 0)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" /></div>
          <div><label className="block text-sm font-medium text-gray-700">Allowed checkout after</label><input type="number" min="0" name="checkout_after_minutes" value={String(shift.checkout_after_minutes ?? 360)} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" /></div>
        </div>
        <fieldset><legend className="text-sm font-medium text-gray-700">Weekly-off days</legend><div className="flex flex-wrap gap-3 mt-2">{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day,index)=>{const days=Array.isArray(shift.weekly_off_days)?shift.weekly_off_days:[];return <label key={day} className="text-sm"><input type="checkbox" checked={days.includes(index)} onChange={()=>setShift({...shift,weekly_off_days:days.includes(index)?days.filter(x=>x!==index):[...days,index]})} /> {day}</label>})}</div></fieldset>

        <div className="flex items-center">
          <input type="checkbox" id="is_overnight" name="is_overnight" checked={Boolean(shift.is_overnight)} onChange={handleChange} className="h-4 w-4 text-blue-600 rounded border-gray-300" />
          <label htmlFor="is_overnight" className="ml-2 block text-sm text-gray-900">
            Is Overnight Shift (ends on next calendar day)
          </label>
        </div>

        <div className="flex justify-end space-x-4">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 bg-white text-[#1F2937] border border-[#CBD5E1] rounded hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-[#028174] text-white rounded hover:bg-[#026c61] disabled:bg-[#E5E7EB] disabled:text-[#64748B] disabled:opacity-100 disabled:border-transparent">
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
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
