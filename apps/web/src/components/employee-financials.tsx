"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";

type SalaryType = "MONTHLY" | "DAILY" | "HOURLY";
type AdvanceType = "ADVANCE_GIVEN" | "REPAYMENT" | "ADJUSTMENT";

interface Salary {
  id: string;
  salary_type: SalaryType;
  monthly_salary: string | null;
  daily_rate: string | null;
  hourly_rate: string | null;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  notes: string | null;
}

interface Advance {
  id: string;
  transaction_type: "OPENING_ADVANCE" | AdvanceType;
  amount: string;
  transaction_date: string;
  notes: string | null;
  entered_by: string | null;
}

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const amountForSalary = (salary: Salary) => salary.salary_type === "MONTHLY" ? Number(salary.monthly_salary) : salary.salary_type === "DAILY" ? Number(salary.daily_rate) : Number(salary.hourly_rate);
const salaryLabel = (salary: Salary) => `${currency.format(amountForSalary(salary))}${salary.salary_type === "DAILY" ? "/day" : salary.salary_type === "HOURLY" ? "/hour" : ""}`;
const errorMessage = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;

export function EmployeeFinancials({ employeeId }: { employeeId: string }) {
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [currentSalary, setCurrentSalary] = useState<Salary | null>(null);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [balance, setBalance] = useState("0.00");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingSalary, setSavingSalary] = useState(false);
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [salaryForm, setSalaryForm] = useState({ salary_type: "MONTHLY" as SalaryType, amount: "", effective_from: "", notes: "" });
  const [advanceForm, setAdvanceForm] = useState({ transaction_type: "ADVANCE_GIVEN" as AdvanceType, amount: "", transaction_date: "", notes: "" });

  const load = useCallback(async () => {
    try {
      const [salaryData, currentData, advanceData] = await Promise.all([
        apiClient.get(`/employees/${employeeId}/salaries`),
        apiClient.get(`/employees/${employeeId}/salaries/current`),
        apiClient.get(`/employees/${employeeId}/advances`),
      ]);
      setSalaries(salaryData as Salary[]);
      setCurrentSalary(currentData as Salary | null);
      const data = advanceData as { transactions: Advance[]; pending_balance: string };
      setAdvances(data.transactions);
      setBalance(data.pending_balance);
    } catch (loadError) {
      setError(errorMessage(loadError, "Failed to load salary and advance details"));
    }
  }, [employeeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch callback updates financial state after the request resolves.
    void load();
  }, [load]);

  const addSalary = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(""); setSuccess(""); setSavingSalary(true);
    const payload: Record<string, unknown> = { salary_type: salaryForm.salary_type, effective_from: salaryForm.effective_from, notes: salaryForm.notes || null };
    if (salaryForm.salary_type === "MONTHLY") payload.monthly_salary = Number(salaryForm.amount);
    if (salaryForm.salary_type === "DAILY") payload.daily_rate = Number(salaryForm.amount);
    if (salaryForm.salary_type === "HOURLY") payload.hourly_rate = Number(salaryForm.amount);
    try {
      await apiClient.post(`/employees/${employeeId}/salaries`, payload);
      setSalaryForm({ salary_type: "MONTHLY", amount: "", effective_from: "", notes: "" });
      setSuccess("Salary configuration added. Previous active period was closed where required.");
      await load();
    } catch (saveError) { setError(errorMessage(saveError, "Failed to add salary configuration")); } finally { setSavingSalary(false); }
  };

  const toggleSalary = async (salary: Salary) => {
    setError(""); setSuccess("");
    try {
      await apiClient.patch(`/employees/${employeeId}/salaries/${salary.id}/status`, { active: !salary.active });
      setSuccess(`Salary configuration ${salary.active ? "deactivated" : "activated"}.`);
      await load();
    } catch (statusError) { setError(errorMessage(statusError, "Failed to update salary status")); }
  };

  const addAdvance = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(""); setSuccess(""); setSavingAdvance(true);
    try {
      await apiClient.post(`/employees/${employeeId}/advances`, { ...advanceForm, amount: Number(advanceForm.amount), notes: advanceForm.notes || null });
      setAdvanceForm({ transaction_type: "ADVANCE_GIVEN", amount: "", transaction_date: "", notes: "" });
      setSuccess("Advance transaction recorded.");
      await load();
    } catch (saveError) { setError(errorMessage(saveError, "Failed to record advance transaction")); } finally { setSavingAdvance(false); }
  };

  return (
    <div className="space-y-6">
      {success && <div className="rounded bg-green-100 p-3 text-green-800" role="status">{success}</div>}
      {error && <div className="rounded bg-red-100 p-3 text-red-700" role="alert">{error}</div>}

      <section className="rounded bg-white p-6 shadow">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-xl font-semibold">Salary</h2><span className="text-sm text-gray-600">Current: {currentSalary ? salaryLabel(currentSalary) : "Not configured"}</span></div>
        <form onSubmit={addSalary} className="mb-5 grid grid-cols-1 gap-3 rounded border bg-gray-50 p-4 md:grid-cols-4">
          <select value={salaryForm.salary_type} onChange={(event) => setSalaryForm({ ...salaryForm, salary_type: event.target.value as SalaryType })} className="rounded border px-3 py-2"><option value="MONTHLY">Monthly</option><option value="DAILY">Daily</option><option value="HOURLY">Hourly</option></select>
          <input required min="0.01" step="0.01" type="number" placeholder={salaryForm.salary_type === "MONTHLY" ? "Monthly salary" : salaryForm.salary_type === "DAILY" ? "Daily rate" : "Hourly rate"} value={salaryForm.amount} onChange={(event) => setSalaryForm({ ...salaryForm, amount: event.target.value })} className="rounded border px-3 py-2" />
          <input required type="date" value={salaryForm.effective_from} onChange={(event) => setSalaryForm({ ...salaryForm, effective_from: event.target.value })} className="rounded border px-3 py-2" />
          <button disabled={savingSalary} className="rounded bg-[#028174] px-4 py-2 text-white disabled:opacity-60">{savingSalary ? "Saving..." : "Add New Salary"}</button>
          <input placeholder="Notes (optional)" value={salaryForm.notes} onChange={(event) => setSalaryForm({ ...salaryForm, notes: event.target.value })} className="rounded border px-3 py-2 md:col-span-3" />
        </form>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-gray-500"><th className="p-2">Type</th><th className="p-2">Salary / Rate</th><th className="p-2">Effective From</th><th className="p-2">Effective To</th><th className="p-2">Status</th><th className="p-2">Notes</th><th className="p-2">Action</th></tr></thead><tbody>{salaries.map((salary) => <tr key={salary.id} className="border-b"><td className="p-2">{salary.salary_type}</td><td className="p-2">{salaryLabel(salary)}</td><td className="p-2">{salary.effective_from}</td><td className="p-2">{salary.effective_to ?? "Present"}</td><td className="p-2">{salary.active ? "Active" : "Inactive"}</td><td className="p-2">{salary.notes || "—"}</td><td className="p-2"><button type="button" onClick={() => void toggleSalary(salary)} className="text-[#7C4A03] hover:underline">{salary.active ? "Deactivate" : "Activate"}</button></td></tr>)}{salaries.length === 0 && <tr><td colSpan={7} className="p-3 text-center text-gray-500">No salary history.</td></tr>}</tbody></table></div>
      </section>

      <section className="rounded bg-white p-6 shadow">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-xl font-semibold">Advance</h2><span className="text-lg font-semibold text-[#7C4A03]">Pending Advance Balance: {currency.format(Number(balance))}</span></div>
        <form onSubmit={addAdvance} className="mb-5 grid grid-cols-1 gap-3 rounded border bg-gray-50 p-4 md:grid-cols-4">
          <select value={advanceForm.transaction_type} onChange={(event) => setAdvanceForm({ ...advanceForm, transaction_type: event.target.value as AdvanceType })} className="rounded border px-3 py-2"><option value="ADVANCE_GIVEN">Add Advance</option><option value="REPAYMENT">Record Repayment</option><option value="ADJUSTMENT">Add Adjustment</option></select>
          <input required type="number" step="0.01" min={advanceForm.transaction_type === "ADJUSTMENT" ? undefined : "0.01"} placeholder={advanceForm.transaction_type === "ADJUSTMENT" ? "Signed adjustment" : "Amount"} value={advanceForm.amount} onChange={(event) => setAdvanceForm({ ...advanceForm, amount: event.target.value })} className="rounded border px-3 py-2" />
          <input required type="date" value={advanceForm.transaction_date} onChange={(event) => setAdvanceForm({ ...advanceForm, transaction_date: event.target.value })} className="rounded border px-3 py-2" />
          <button disabled={savingAdvance} className="rounded bg-[#028174] px-4 py-2 text-white disabled:opacity-60">{savingAdvance ? "Saving..." : "Record Transaction"}</button>
          <input placeholder="Notes (optional)" value={advanceForm.notes} onChange={(event) => setAdvanceForm({ ...advanceForm, notes: event.target.value })} className="rounded border px-3 py-2 md:col-span-3" />
        </form>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-gray-500"><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">Amount</th><th className="p-2">Effect on Balance</th><th className="p-2">Notes</th><th className="p-2">Entered By</th></tr></thead><tbody>{advances.map((advance) => { const negative = advance.transaction_type === "REPAYMENT" || (advance.transaction_type === "ADJUSTMENT" && Number(advance.amount) < 0); return <tr key={advance.id} className="border-b"><td className="p-2">{advance.transaction_date}</td><td className="p-2">{advance.transaction_type}</td><td className="p-2">{currency.format(Number(advance.amount))}</td><td className={`p-2 ${negative ? "text-green-700" : "text-[#7C4A03]"}`}>{negative ? "−" : "+"}{currency.format(Math.abs(Number(advance.amount)))}</td><td className="p-2">{advance.notes || "—"}</td><td className="p-2">{advance.entered_by || "—"}</td></tr>; })}{advances.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-gray-500">No advance transactions.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
