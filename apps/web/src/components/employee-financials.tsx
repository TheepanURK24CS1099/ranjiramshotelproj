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
const amountForSalary = (salary: Salary) =>
  salary.salary_type === "MONTHLY"
    ? Number(salary.monthly_salary)
    : salary.salary_type === "DAILY"
      ? Number(salary.daily_rate)
      : Number(salary.hourly_rate);
const salaryLabel = (salary: Salary) =>
  `${currency.format(amountForSalary(salary))}${
    salary.salary_type === "DAILY" ? "/day" : salary.salary_type === "HOURLY" ? "/hour" : "/month"
  }`;
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

export function EmployeeFinancials({ employeeId }: { employeeId: string }) {
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [currentSalary, setCurrentSalary] = useState<Salary | null>(null);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [balance, setBalance] = useState("0.00");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingSalary, setSavingSalary] = useState(false);
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [salaryForm, setSalaryForm] = useState({
    salary_type: "MONTHLY" as SalaryType,
    amount: "",
    effective_from: "",
    notes: "",
  });
  const [advanceForm, setAdvanceForm] = useState({
    transaction_type: "ADVANCE_GIVEN" as AdvanceType,
    amount: "",
    transaction_date: "",
    notes: "",
  });

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch callback updates financial state after request resolves.
    void load();
  }, [load]);

  const addSalary = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSavingSalary(true);
    const payload: Record<string, unknown> = {
      salary_type: salaryForm.salary_type,
      effective_from: salaryForm.effective_from,
      notes: salaryForm.notes || null,
    };
    if (salaryForm.salary_type === "MONTHLY") payload.monthly_salary = Number(salaryForm.amount);
    if (salaryForm.salary_type === "DAILY") payload.daily_rate = Number(salaryForm.amount);
    if (salaryForm.salary_type === "HOURLY") payload.hourly_rate = Number(salaryForm.amount);
    try {
      await apiClient.post(`/employees/${employeeId}/salaries`, payload);
      setSalaryForm({ salary_type: "MONTHLY", amount: "", effective_from: "", notes: "" });
      setSuccess("Salary configuration added. Previous active period was closed where required.");
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError, "Failed to add salary configuration"));
    } finally {
      setSavingSalary(false);
    }
  };

  const toggleSalary = async (salary: Salary) => {
    setError("");
    setSuccess("");
    try {
      await apiClient.patch(`/employees/${employeeId}/salaries/${salary.id}/status`, { active: !salary.active });
      setSuccess(`Salary configuration ${salary.active ? "deactivated" : "activated"}.`);
      await load();
    } catch (statusError) {
      setError(errorMessage(statusError, "Failed to update salary status"));
    }
  };

  const addAdvance = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSavingAdvance(true);
    try {
      await apiClient.post(`/employees/${employeeId}/advances`, {
        ...advanceForm,
        amount: Number(advanceForm.amount),
        notes: advanceForm.notes || null,
      });
      setAdvanceForm({ transaction_type: "ADVANCE_GIVEN", amount: "", transaction_date: "", notes: "" });
      setSuccess("Advance transaction recorded.");
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError, "Failed to record advance transaction"));
    } finally {
      setSavingAdvance(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Global Notifications */}
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Salary Section */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">Salary Management</h2>
          </div>
          <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            Current Active Salary: <span className="text-[#028174] font-bold">{currentSalary ? salaryLabel(currentSalary) : "Not configured"}</span>
          </div>
        </div>

        {/* Add Salary Form */}
        <form onSubmit={addSalary} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Configure New Salary</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label htmlFor="salary_form_type" className="sr-only">Salary Type</label>
              <select
                id="salary_form_type"
                aria-label="Salary Type"
                value={salaryForm.salary_type}
                onChange={(event) => setSalaryForm({ ...salaryForm, salary_type: event.target.value as SalaryType })}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="DAILY">Daily</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </div>

            <div>
              <label htmlFor="salary_form_amount" className="sr-only">Salary Amount</label>
              <input
                id="salary_form_amount"
                aria-label="Salary Amount"
                required
                min="0.01"
                step="0.01"
                type="number"
                placeholder={
                  salaryForm.salary_type === "MONTHLY"
                    ? "Monthly salary (₹)"
                    : salaryForm.salary_type === "DAILY"
                      ? "Daily rate (₹)"
                      : "Hourly rate (₹)"
                }
                value={salaryForm.amount}
                onChange={(event) => setSalaryForm({ ...salaryForm, amount: event.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="salary_form_effective_from" className="sr-only">Effective From Date</label>
              <input
                id="salary_form_effective_from"
                aria-label="Effective From Date"
                required
                type="date"
                value={salaryForm.effective_from}
                onChange={(event) => setSalaryForm({ ...salaryForm, effective_from: event.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={savingSalary}
                className="w-full min-h-[44px] rounded-xl bg-[#028174] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#026c61] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
              >
                {savingSalary ? "Saving..." : "Add Salary"}
              </button>
            </div>

            <div className="md:col-span-4">
              <label htmlFor="salary_form_notes" className="sr-only">Salary Notes</label>
              <input
                id="salary_form_notes"
                aria-label="Salary Notes"
                placeholder="Notes (optional)"
                value={salaryForm.notes}
                onChange={(event) => setSalaryForm({ ...salaryForm, notes: event.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
          </div>
        </form>

        {/* Salary History Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="p-3.5">Type</th>
                <th className="p-3.5">Salary / Rate</th>
                <th className="p-3.5">Effective From</th>
                <th className="p-3.5">Effective To</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Notes</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {salaries.map((salary) => (
                <tr key={salary.id} className="hover:bg-slate-50/60">
                  <td className="p-3.5 font-semibold text-slate-900">{salary.salary_type}</td>
                  <td className="p-3.5 font-bold text-slate-900">{salaryLabel(salary)}</td>
                  <td className="p-3.5 text-slate-600">{salary.effective_from}</td>
                  <td className="p-3.5 text-slate-600">{salary.effective_to ?? "Present"}</td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                        salary.active
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {salary.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-500">{salary.notes || "—"}</td>
                  <td className="p-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => void toggleSalary(salary)}
                      className="text-xs font-bold text-[#7C4A03] hover:underline focus-visible:outline-2 focus-visible:outline-amber-600"
                    >
                      {salary.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {salaries.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500 text-xs">
                    No salary history recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Advance Section */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="text-base font-bold text-slate-900">Advance Ledger</h2>
          </div>
          <div className="text-xs font-semibold text-amber-800 bg-amber-50 px-3.5 py-1.5 rounded-full border border-amber-200">
            Pending Advance Balance: <span className="font-bold text-base">{currency.format(Number(balance))}</span>
          </div>
        </div>

        {/* Add Advance Form */}
        <form onSubmit={addAdvance} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Record Advance Transaction</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label htmlFor="advance_form_type" className="sr-only">Transaction Type</label>
              <select
                id="advance_form_type"
                aria-label="Transaction Type"
                value={advanceForm.transaction_type}
                onChange={(event) =>
                  setAdvanceForm({ ...advanceForm, transaction_type: event.target.value as AdvanceType })
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <option value="ADVANCE_GIVEN">Add Advance</option>
                <option value="REPAYMENT">Record Repayment</option>
                <option value="ADJUSTMENT">Add Adjustment</option>
              </select>
            </div>

            <div>
              <label htmlFor="advance_form_amount" className="sr-only">Amount</label>
              <input
                id="advance_form_amount"
                aria-label="Amount"
                required
                type="number"
                step="0.01"
                min={advanceForm.transaction_type === "ADJUSTMENT" ? undefined : "0.01"}
                placeholder={advanceForm.transaction_type === "ADJUSTMENT" ? "Signed adjustment (₹)" : "Amount (₹)"}
                value={advanceForm.amount}
                onChange={(event) => setAdvanceForm({ ...advanceForm, amount: event.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <label htmlFor="advance_form_date" className="sr-only">Transaction Date</label>
              <input
                id="advance_form_date"
                aria-label="Transaction Date"
                required
                type="date"
                value={advanceForm.transaction_date}
                onChange={(event) => setAdvanceForm({ ...advanceForm, transaction_date: event.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={savingAdvance}
                className="w-full min-h-[44px] rounded-xl bg-[#028174] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#026c61] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
              >
                {savingAdvance ? "Saving..." : "Record Transaction"}
              </button>
            </div>

            <div className="md:col-span-4">
              <label htmlFor="advance_form_notes" className="sr-only">Advance Transaction Notes</label>
              <input
                id="advance_form_notes"
                aria-label="Advance Transaction Notes"
                placeholder="Notes (optional)"
                value={advanceForm.notes}
                onChange={(event) => setAdvanceForm({ ...advanceForm, notes: event.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
              />
            </div>
          </div>
        </form>

        {/* Advance History Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Type</th>
                <th className="p-3.5">Amount</th>
                <th className="p-3.5">Effect on Balance</th>
                <th className="p-3.5">Notes</th>
                <th className="p-3.5">Entered By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {advances.map((advance) => {
                const negative =
                  advance.transaction_type === "REPAYMENT" ||
                  (advance.transaction_type === "ADJUSTMENT" && Number(advance.amount) < 0);
                return (
                  <tr key={advance.id} className="hover:bg-slate-50/60">
                    <td className="p-3.5 font-medium text-slate-900">{advance.transaction_date}</td>
                    <td className="p-3.5 font-semibold text-slate-700">{advance.transaction_type}</td>
                    <td className="p-3.5 font-bold text-slate-900">{currency.format(Number(advance.amount))}</td>
                    <td className={`p-3.5 font-bold ${negative ? "text-emerald-700" : "text-[#7C4A03]"}`}>
                      {negative ? "−" : "+"}{currency.format(Math.abs(Number(advance.amount)))}
                    </td>
                    <td className="p-3.5 text-slate-500">{advance.notes || "—"}</td>
                    <td className="p-3.5 text-slate-500">{advance.entered_by || "—"}</td>
                  </tr>
                );
              })}
              {advances.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500 text-xs">
                    No advance transactions recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
