"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatShiftTime } from "@/lib/format";

export default function NewEmployeePage() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    employee_code: "",
    biometric_id: "",
    name: "",
    phone: "",
    department: "",
    designation: "",
    joining_date: "",
    weekly_off_day: "",
    shift_id: "",
    effective_from: "",
    salary_type: "MONTHLY",
    salary_amount: "",
    salary_effective_from: "",
    salary_notes: "",
    opening_advance: "",
    opening_advance_date: "",
    opening_advance_notes: "",
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
      employee_code: formData.employee_code || undefined,
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

    if (formData.salary_amount && formData.salary_effective_from) {
      const initialSalary: Record<string, unknown> = {
        salary_type: formData.salary_type,
        effective_from: formData.salary_effective_from,
        notes: formData.salary_notes || undefined,
      };
      if (formData.salary_type === "MONTHLY") initialSalary.monthly_salary = Number(formData.salary_amount);
      if (formData.salary_type === "DAILY") initialSalary.daily_rate = Number(formData.salary_amount);
      if (formData.salary_type === "HOURLY") initialSalary.hourly_rate = Number(formData.salary_amount);
      payload.initial_salary = initialSalary;
    } else if (formData.salary_amount || formData.salary_effective_from) {
      setError("Salary amount and effective date are both required when adding a salary.");
      setLoading(false);
      return;
    }

    if (formData.opening_advance && formData.opening_advance_date) {
      payload.opening_advance = {
        amount: Number(formData.opening_advance),
        transaction_date: formData.opening_advance_date,
        notes: formData.opening_advance_notes || undefined,
      };
    } else if (formData.opening_advance || formData.opening_advance_date) {
      setError("Opening Advance amount and date are both required.");
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
            <label className="block text-sm font-medium text-gray-700">Employee ID</label>
            <input type="text" name="employee_code" value={formData.employee_code} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
          </div>
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
                {shifts.map(s => <option key={String(s.id)} value={String(s.id)}>{String(s.name)} ({formatShiftTime(s.start_time)} – {formatShiftTime(s.end_time)})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Effective From</label>
              <input type="date" name="effective_from" value={formData.effective_from} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t space-y-4">
          <h2 className="text-lg font-medium">Initial Salary (Optional)</h2>
          <p className="text-sm text-gray-600">Monthly salary is the default. Daily and hourly rates are available for future use.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className="block text-sm font-medium text-gray-700">Salary Type</label><select name="salary_type" value={formData.salary_type} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded"><option value="MONTHLY">Monthly</option><option value="DAILY">Daily</option><option value="HOURLY">Hourly</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700">{formData.salary_type === "MONTHLY" ? "Monthly Salary" : formData.salary_type === "DAILY" ? "Daily Rate" : "Hourly Rate"}</label><input type="number" min="0.01" step="0.01" name="salary_amount" value={formData.salary_amount} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Effective Date</label><input type="date" name="salary_effective_from" value={formData.salary_effective_from} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Notes</label><input name="salary_notes" value={formData.salary_notes} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" /></div>
          </div>
        </div>

        <div className="pt-6 border-t space-y-4">
          <h2 className="text-lg font-medium">Opening Advance (Optional)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className="block text-sm font-medium text-gray-700">Opening Advance Amount</label><input type="number" min="0.01" step="0.01" name="opening_advance" value={formData.opening_advance} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Opening Advance Date</label><input type="date" name="opening_advance_date" value={formData.opening_advance_date} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" /></div>
            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700">Notes</label><input name="opening_advance_notes" value={formData.opening_advance_notes} onChange={handleChange} className="w-full px-3 py-2 mt-1 border rounded" /></div>
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
