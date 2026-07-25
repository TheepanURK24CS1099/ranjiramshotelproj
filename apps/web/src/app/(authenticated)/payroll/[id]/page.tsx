/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { usePayrollModule } from "@/components/payroll-module-context";
import { apiClient } from "@/lib/api-client";

const inr = (v: unknown) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(v ?? 0));

export default function PayrollDetail() {
  const { id } = useParams<{ id: string }>();
  const { payrollEnabled } = usePayrollModule();
  const [period, setPeriod] = useState<any>();
  const [records, setRecords] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [user, setUser] = useState<any>();
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [action, setAction] = useState<"records" | "payments" | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  const load = () =>
    Promise.all([
      apiClient.get(`/payroll/periods/${id}`),
      apiClient.get(`/payroll/periods/${id}/records`),
      apiClient.get(`/payroll/periods/${id}/payments`),
      apiClient.get("/auth/me"),
    ])
      .then(([p, r, pay, u]) => {
        setPeriod(p);
        setRecords(r as any[]);
        setPayments(pay as any[]);
        setUser(u);
      })
      .catch((e: Error) => setMessage(e.message));

  useEffect(() => {
    void load();
  }, [id]);

  const canReset = payrollEnabled && user?.role === "ADMIN";
  const toggle = (value: string, values: string[], setValues: (ids: string[]) => void) =>
    setValues(values.includes(value) ? values.filter((id) => id !== value) : [...values, value]);

  const reset = async () => {
    if (!action || !reason.trim()) {
      setMessage("A reset reason is required.");
      return;
    }
    setWorking(true);
    try {
      const ids = action === "records" ? selectedRecords : selectedPayments;
      await apiClient.delete(
        action === "records" ? "/payroll/records/bulk-reset" : "/payroll/payments/bulk-reset",
        {
          body: JSON.stringify({ ids, reason }),
          headers: { "Content-Type": "application/json" },
        }
      );
      setAction(null);
      setReason("");
      setSelectedRecords([]);
      setSelectedPayments([]);
      setMessage("Selected payroll data was reset. Master and attendance data was preserved.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setWorking(false);
    }
  };

  if (!period) return <div className="p-6 text-slate-600 font-medium">{message || "Loading payroll period..."}</div>;

  return (
    <div className="space-y-6">
      {/* Navigation & Header */}
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#028174] hover:underline mb-2"
          href="/payroll"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Payroll Periods
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Payroll {period.month}/{period.year}
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-bold text-[#028174]">
            Status: {period.status}
          </span>
        </div>
      </div>

      {/* Message Alert */}
      {message && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm font-medium text-sky-900 flex items-center gap-2" role="status">
          <svg className="h-5 w-5 shrink-0 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{message}</span>
        </div>
      )}

      {/* Section 1: Employee Payroll Records */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200/80 px-6 py-4 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <h2 className="text-base font-bold text-slate-900">Employee Payroll Records</h2>
            <span className="text-slate-500 font-medium">{selectedRecords.length} employee records selected</span>
          </div>

          {canReset && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!selectedRecords.length || working}
                onClick={() => setAction("records")}
                className="min-h-[36px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
              >
                Clear Selected Payroll Records
              </button>
              {selectedRecords.length > 0 && (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setSelectedRecords([])}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Clear Selection
                </button>
              )}
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {canReset && (
                  <th className="px-6 py-4 w-10">
                    <input
                      aria-label="Select all payroll employee records"
                      type="checkbox"
                      checked={records.length > 0 && records.every((r) => selectedRecords.includes(r.id))}
                      onChange={() =>
                        setSelectedRecords(records.every((r) => selectedRecords.includes(r.id)) ? [] : records.map((r) => r.id))
                      }
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                )}
                <th className="px-6 py-4">Employee Name</th>
                <th className="px-6 py-4 text-right">Base Salary</th>
                <th className="px-6 py-4 text-right">Gross Pay</th>
                <th className="px-6 py-4 text-right">Net Pay</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => {
                const isChecked = selectedRecords.includes(r.id);
                return (
                  <tr key={r.id} className={`transition-colors hover:bg-slate-50/60 ${isChecked ? "bg-teal-50/40" : ""}`}>
                    {canReset && (
                      <td className="px-6 py-4">
                        <input
                          aria-label={`Select payroll record ${r.employee_name}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(r.id, selectedRecords, setSelectedRecords)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 font-bold text-slate-900">
                      <Link className="text-[#028174] hover:underline" href={`/payroll/records/${r.id}`}>
                        {r.employee_name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-700">{inr(r.base_salary)}</td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900">{inr(r.gross_pay)}</td>
                    <td className="px-6 py-4 text-right font-bold text-[#028174]">{inr(r.net_pay)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {records.length === 0 && (
                <tr>
                  <td colSpan={canReset ? 6 : 5} className="px-6 py-8 text-center text-sm text-slate-500">
                    No employee payroll records found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (768px and below) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {records.map((r) => {
            const isChecked = selectedRecords.includes(r.id);
            return (
              <div key={r.id} className={`p-4 space-y-2 ${isChecked ? "bg-teal-50/40" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {canReset && (
                      <input
                        aria-label={`Select payroll record ${r.employee_name}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(r.id, selectedRecords, setSelectedRecords)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                    )}
                    <Link className="text-base font-bold text-[#028174] hover:underline" href={`/payroll/records/${r.id}`}>
                      {r.employee_name}
                    </Link>
                  </div>
                  <span className="inline-flex rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                    {r.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs">
                  <div>
                    <span className="text-slate-500 block">Base Salary:</span>
                    <span className="font-semibold text-slate-800">{inr(r.base_salary)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Gross Pay:</span>
                    <span className="font-semibold text-slate-900">{inr(r.gross_pay)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Net Pay:</span>
                    <span className="font-bold text-[#028174]">{inr(r.net_pay)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {records.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">
              No employee payroll records found for this period.
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Payment History */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200/80 px-6 py-4 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <h2 className="text-base font-bold text-slate-900">Payment History</h2>
            <span className="text-slate-500 font-medium">{selectedPayments.length} payment records selected</span>
          </div>

          {canReset && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!selectedPayments.length || working}
                onClick={() => setAction("payments")}
                className="min-h-[36px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
              >
                Clear Selected Payment Records
              </button>
              {selectedPayments.length > 0 && (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setSelectedPayments([])}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Clear Selection
                </button>
              )}
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {canReset && (
                  <th className="px-6 py-4 w-10">
                    <input
                      aria-label="Select all payment records"
                      type="checkbox"
                      checked={payments.length > 0 && payments.every((pay) => selectedPayments.includes(pay.id))}
                      onChange={() =>
                        setSelectedPayments(payments.every((pay) => selectedPayments.includes(pay.id)) ? [] : payments.map((pay) => pay.id))
                      }
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                )}
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((pay) => {
                const isChecked = selectedPayments.includes(pay.id);
                return (
                  <tr key={pay.id} className={`transition-colors hover:bg-slate-50/60 ${isChecked ? "bg-teal-50/40" : ""}`}>
                    {canReset && (
                      <td className="px-6 py-4">
                        <input
                          aria-label={`Select payment ${pay.id}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(pay.id, selectedPayments, setSelectedPayments)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 font-bold text-slate-900">{pay.employee_name}</td>
                    <td className="px-6 py-4 text-right font-bold text-[#028174]">{inr(pay.amount)}</td>
                    <td className="px-6 py-4 font-medium text-slate-700">{pay.payment_method}</td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">{pay.payment_reference || "—"}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        {pay.status}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {payments.length === 0 && (
                <tr>
                  <td colSpan={canReset ? 6 : 5} className="px-6 py-8 text-center text-sm text-slate-500">
                    No payment history entries found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (768px and below) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {payments.map((pay) => {
            const isChecked = selectedPayments.includes(pay.id);
            return (
              <div key={pay.id} className={`p-4 space-y-2 ${isChecked ? "bg-teal-50/40" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {canReset && (
                      <input
                        aria-label={`Select payment ${pay.id}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(pay.id, selectedPayments, setSelectedPayments)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                    )}
                    <h3 className="text-base font-bold text-slate-900">{pay.employee_name}</h3>
                  </div>
                  <span className="inline-flex rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    {pay.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs">
                  <div>
                    <span className="text-slate-500 block">Amount:</span>
                    <span className="font-bold text-[#028174]">{inr(pay.amount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Method:</span>
                    <span className="font-medium text-slate-800">{pay.payment_method}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ref:</span>
                    <span className="font-mono text-slate-700">{pay.payment_reference || "—"}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {payments.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">
              No payment history entries found for this period.
            </div>
          )}
        </div>
      </section>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={action !== null}
        pending={working}
        recordName="payroll data"
        title={
          action === "payments"
            ? "Clear selected payment records?"
            : "Clear selected payroll employee records?"
        }
        message="This reset permanently removes linked payroll payments, salary slips, deductions, and employee payroll records. It may remove the payroll period when no dependent payroll records remain. Employee, salary, attendance, shifts, raw punches, and unrelated advance history are preserved. A reset reason is required and the action is audited."
        confirmLabel="Clear Selected"
        onCancel={() => setAction(null)}
        onConfirm={() => void reset()}
      >
        <textarea
          aria-label="Reset reason"
          className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
          placeholder="Reset reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </ConfirmationModal>
    </div>
  );
}
