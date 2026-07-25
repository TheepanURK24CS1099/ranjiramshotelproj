/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { usePayrollModule } from "@/components/payroll-module-context";
import { apiClient } from "@/lib/api-client";
import { config } from "@/lib/config";

const inr = (v: unknown) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(v ?? 0));
const date = (v: unknown) =>
  v ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(String(v))) : "—";
const dateTime = (v: unknown) =>
  v ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(String(v))) : "—";

export default function RecordDetail() {
  const { recordId } = useParams<{ recordId: string }>();
  const { payrollEnabled } = usePayrollModule();
  const [r, setR] = useState<any>();
  const [payments, setPayments] = useState<any[]>([]);
  const [user, setUser] = useState<any>();
  const [recovery, setRecovery] = useState("0");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [reversal, setReversal] = useState<any>();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const load = () =>
    Promise.all([
      apiClient.get(`/payroll/records/${recordId}`),
      apiClient.get(`/payroll/records/${recordId}/payments`),
      apiClient.get("/auth/me"),
    ])
      .then(([x, p, u]) => {
        setR(x);
        setPayments(p as any[]);
        setUser(u);
        setRecovery(String((x as any).advance_recovery));
      })
      .catch((e: Error) => setMessage(e.message));

  useEffect(() => {
    void load();
  }, [recordId]);

  const reverse = async () => {
    setPending(true);
    try {
      await apiClient.post(`/payroll/payments/${reversal.id}/reverse`, { reason });
      setReversal(undefined);
      setReason("");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to reverse payment");
    } finally {
      setPending(false);
    }
  };

  if (!r) return <div className="p-6 text-slate-600 font-medium">{message || "Loading record details..."}</div>;

  const readOnly =
    !payrollEnabled ||
    ["APPROVED", "PAID", "LOCKED", "CANCELLED"].includes(r.period_status) ||
    ["APPROVED", "PAID", "CANCELLED"].includes(r.status);

  const isAdmin = user?.role === "ADMIN";
  const slip = `${config.apiUrl}/payroll/records/${r.id}/slip`;

  return (
    <div className="space-y-6">
      {/* Navigation & Actions */}
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#028174] hover:underline mb-2"
          href={`/payroll/${r.payroll_period_id}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Period Overview
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {r.employee_name} Payroll Record
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 font-mono">
              Record ID: {r.id}
            </p>
          </div>

          {["APPROVED", "PAID"].includes(r.period_status) && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.open(slip, "_blank")}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
              >
                <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Salary Slip
              </button>
              <button
                type="button"
                onClick={() => window.open(`${slip}/pdf`, "_blank")}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#028174] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#026c61] transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banners */}
      {r.period_status === "APPROVED" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 flex items-center gap-2" role="status">
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
          APPROVED — PAYMENT PENDING
        </div>
      )}
      {r.period_status === "PAID" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 flex items-center gap-2" role="status">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          PAID
        </div>
      )}
      {r.period_status === "CANCELLED" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-900 flex items-center gap-2" role="alert">
          This payroll period was cancelled and is read-only history.
        </div>
      )}
      {!payrollEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900" role="alert">
          Payroll is disabled. This record is read-only; payment history and existing slips remain available.
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm font-medium text-sky-900" role="status">
          {message}
        </div>
      )}

      {/* Financial Highlights Section */}
      <section aria-label="Financial Breakdown" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Salary Base</span>
          <div className="mt-1 text-base font-bold text-slate-900">
            {r.salary_type} {inr(r.base_salary)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Gross Pay</span>
          <div className="mt-1 text-base font-bold text-slate-900">{inr(r.gross_pay)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Other Deductions</span>
          <div className="mt-1 text-base font-bold text-rose-700">{inr(r.other_deductions)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Advance Recovery</span>
          <div className="mt-1 text-base font-bold text-amber-700">{inr(r.advance_recovery)}</div>
        </div>

        {/* Prominent Net Pay Card */}
        <div className="rounded-2xl border-2 border-teal-500/80 bg-teal-50/50 p-5 shadow-xs sm:col-span-2 lg:col-span-2">
          <span className="text-xs font-bold text-[#028174] uppercase tracking-wider block">Net Pay</span>
          <div className="mt-1 text-2xl font-extrabold text-[#028174]">{inr(r.net_pay)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Payment Status</span>
          <div className="mt-1 text-sm font-bold text-slate-900">
            {r.period_status === "APPROVED" ? "APPROVED — PAYMENT PENDING" : r.status}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Payment Method</span>
          <div className="mt-1 text-sm font-semibold text-slate-900">{payments[0]?.payment_method || "—"}</div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Reference & Date</span>
          <div className="mt-1 text-xs font-semibold text-slate-900">
            {payments[0]?.payment_reference || "—"} ({date(payments[0]?.payment_date)})
          </div>
        </div>
      </section>

      {/* Section 2: Attendance Summary and Calculation Details */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <svg className="h-5 w-5 text-[#028174]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Attendance Summary & Calculation Formula
        </h2>
        <p className="text-xs text-slate-600">
          Monthly salary uses calendar-day proration; present/late/early exit/weekly off/holiday are paid, half day is 0.5, missing punch is unpaid.
        </p>
        <pre className="overflow-auto rounded-xl bg-slate-900 p-4 text-xs font-mono text-slate-100 max-h-72">
          {JSON.stringify(r.calculation_details, null, 2)}
        </pre>
      </section>

      {/* Section 3: Deductions */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
          Deductions
        </h2>

        {r.deductions.map((d: any) => (
          <div key={d.id} className="flex items-center justify-between gap-2 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="font-semibold text-slate-800">
              {d.deduction_type}: <strong className="text-rose-700 font-bold">{inr(d.amount)}</strong>
            </span>
            {!readOnly && (
              <button
                type="button"
                className="text-xs font-bold text-rose-700 hover:underline"
                onClick={() =>
                  void apiClient
                    .delete(`/payroll/records/${r.id}/deductions/${d.id}`)
                    .then(load)
                    .catch((e: Error) => setMessage(e.message))
                }
              >
                Remove
              </button>
            )}
          </div>
        ))}

        {!readOnly && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center pt-2">
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
            />
            <button
              type="button"
              onClick={() =>
                void apiClient
                  .post(`/payroll/records/${r.id}/deductions`, { deduction_type: "OTHER", amount: Number(amount) })
                  .then(load)
                  .catch((e: Error) => setMessage(e.message))
              }
              className="min-h-[44px] rounded-xl bg-[#028174] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#026c61] transition-colors"
            >
              Add Other Deduction
            </button>
          </div>
        )}
      </section>

      {/* Section 4: Advance Recovery */}
      {!readOnly && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-3">
          <h2 className="text-base font-bold text-slate-900">
            Advance Recovery Adjustment
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="number"
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
              className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus-visible:outline-2 focus-visible:outline-teal-600"
            />
            <button
              type="button"
              onClick={() =>
                void apiClient
                  .patch(`/payroll/records/${r.id}`, { advance_recovery: Number(recovery) })
                  .then(load)
                  .catch((e: Error) => setMessage(e.message))
              }
              className="min-h-[44px] rounded-xl bg-[#028174] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#026c61] transition-colors"
            >
              Save Advance Recovery
            </button>
          </div>
        </section>
      )}

      {/* Section 5: Payment History */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200/80 px-6 py-4 bg-slate-50/70">
          <h2 className="text-base font-bold text-slate-900">Payment History</h2>
        </div>

        {payments.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No payments recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[850px] w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3.5 text-right">Amount</th>
                  <th className="px-6 py-3.5">Method</th>
                  <th className="px-6 py-3.5">Reference</th>
                  <th className="px-6 py-3.5">Payment Date</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Notes</th>
                  <th className="px-6 py-3.5">Created By</th>
                  <th className="px-6 py-3.5">Created At</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-6 py-4 text-right font-bold text-[#028174]">{inr(p.amount)}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">{p.payment_method}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-600">{p.payment_reference || "—"}</td>
                    <td className="px-6 py-4 text-slate-700">{date(p.payment_date)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{p.notes || "—"}</td>
                    <td className="px-6 py-4 text-slate-700">{p.created_by_username || p.created_by_email}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{dateTime(p.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      {isAdmin && payrollEnabled && p.status === "PAID" && (
                        <button
                          type="button"
                          className="min-h-[32px] rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                          onClick={() => setReversal(p)}
                        >
                          Reverse Payment
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={Boolean(reversal)}
        recordName="payment"
        title="Reverse payment?"
        message="The payment will remain in history and be marked as reversed."
        confirmLabel="Reverse Payment"
        pending={pending}
        onCancel={() => setReversal(undefined)}
        onConfirm={() => void reverse()}
      >
        <textarea
          aria-label="Reversal reason"
          required
          className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
          placeholder="Reversal reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </ConfirmationModal>
    </div>
  );
}
