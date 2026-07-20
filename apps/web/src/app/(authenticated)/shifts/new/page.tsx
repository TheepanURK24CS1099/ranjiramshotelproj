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
    <div className="max-w-2xl mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-2xl font-semibold mb-6">Add New Shift</h1>
      
      {error && <div className="mb-4 p-3 text-red-600 bg-red-100 rounded">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Shift Name *</label>
          <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Time (HH:MM) *</label>
            <input type="time" name="start_time" required value={formData.start_time} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End Time (HH:MM) *</label>
            <input type="time" name="end_time" required value={formData.end_time} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Grace Minutes</label>
            <input type="number" min="0" name="grace_minutes" value={formData.grace_minutes} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Min Work Minutes</label>
            <input type="number" min="0" name="minimum_work_minutes" value={formData.minimum_work_minutes} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
        </div>

        <div className="flex items-center">
          <input type="checkbox" id="is_overnight" name="is_overnight" checked={formData.is_overnight} onChange={handleChange} className="h-4 w-4 text-blue-600 rounded border-gray-300" />
          <label htmlFor="is_overnight" className="ml-2 block text-sm text-gray-900">
            Is Overnight Shift (ends on next calendar day)
          </label>
        </div>

        <div className="flex justify-end space-x-4">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 bg-white text-[#1F2937] border border-[#CBD5E1] rounded hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-[#028174] text-white rounded hover:bg-[#026c61] disabled:bg-[#E5E7EB] disabled:text-[#64748B] disabled:opacity-100 disabled:border-transparent">
            {loading ? "Saving..." : "Save Shift"}
          </button>
        </div>
      </form>
    </div>
  );
}
