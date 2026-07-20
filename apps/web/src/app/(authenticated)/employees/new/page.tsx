"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";

export default function NewEmployeePage() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    biometric_id: "",
    name: "",
    phone: "",
    department: "",
    designation: "",
    joining_date: "",
    weekly_off_day: "",
    shift_id: "",
    effective_from: "",
  });

  useEffect(() => {
    apiClient.get("/shifts?active=true")
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
    <div className="max-w-3xl mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-2xl font-semibold mb-6">Add New Employee</h1>
      
      {error && <div className="mb-4 p-3 text-red-600 bg-red-100 rounded">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Biometric ID *</label>
            <input type="number" name="biometric_id" required value={formData.biometric_id} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Name *</label>
            <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Department</label>
            <input type="text" name="department" value={formData.department} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Designation</label>
            <input type="text" name="designation" value={formData.designation} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Joining Date *</label>
            <input type="date" name="joining_date" required value={formData.joining_date} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Weekly Off Day (0-6)</label>
            <input type="number" min="0" max="6" name="weekly_off_day" value={formData.weekly_off_day} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" placeholder="0=Sunday, 1=Monday..." />
          </div>
        </div>

        <div className="pt-6 border-t">
          <h2 className="text-lg font-medium mb-4">Initial Shift Assignment (Optional)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Select Shift</label>
              <select name="shift_id" value={formData.shift_id} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded">
                <option value="">-- None --</option>
                {shifts.map(s => <option key={String(s.id)} value={String(s.id)}>{String(s.name)} ({String(s.start_time)} - {String(s.end_time)})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Effective From</label>
              <input type="date" name="effective_from" value={formData.effective_from} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 bg-white text-[#1F2937] border border-[#CBD5E1] rounded hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-[#028174] text-white rounded hover:bg-[#026c61] disabled:bg-[#E5E7EB] disabled:text-[#64748B] disabled:opacity-100 disabled:border-transparent">
            {loading ? "Saving..." : "Save Employee"}
          </button>
        </div>
      </form>
    </div>
  );
}
