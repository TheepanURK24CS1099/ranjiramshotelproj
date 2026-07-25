"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { usePayrollModule } from "@/components/payroll-module-context";
import { ApiError, apiClient } from "@/lib/api-client";

type PeriodStatus = "DRAFT" | "GENERATED" | "APPROVED" | "PAID" | "LOCKED" | "CANCELLED";
type Period = {
  id: string;
  year: number;
  month: number;
  status: PeriodStatus;
  employee_count: number;
  generated_at?: string | null;
  gross_total: string;
  deduction_total: string;
  advance_recovery_total: string;
  net_pay_total: string;
  can_delete_empty_cancelled: boolean;
  can_clear_unpaid_test: boolean;
  clear_block_reason?: string | null;
};
type BulkAction = "drafts" | "empty-cancelled" | "clear-test" | "reset";
type Confirmation =
  | { action: BulkAction; periods: Period[] }
  | { action: "cancel" | "pay"; periods: [Period] };

const inr = (value: unknown) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value ?? 0));

const statusClass = (status: PeriodStatus) => {
  switch (status) {
    case "CANCELLED":
      return "bg-rose-50 text-rose-800 border-rose-300";
    case "LOCKED":
    case "PAID":
      return "bg-emerald-50 text-emerald-800 border-emerald-300";
    case "GENERATED":
    case "APPROVED":
      return "bg-sky-50 text-sky-800 border-sky-300";
    default:
      return "bg-amber-50 text-amber-800 border-amber-300";
  }
};

export default function PayrollPage() {
  const { payrollEnabled } = usePayrollModule();
  const [items, setItems] = useState<Period[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [role, setRole] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("drafts");
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [working, setWorking] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReference, setPaymentReference] = useState("");

  const load = async () => {
    const [periods, user] = await Promise.all([
      apiClient.get("/payroll/periods"),
      apiClient.get("/auth/me"),
    ]);
    setItems(periods as Period[]);
    setRole(String((user as { role: string }).role));
  };

  useEffect(() => {
    Promise.all([apiClient.get("/payroll/periods"), apiClient.get("/auth/me")])
      .then(([periods, user]) => {
        setItems(periods as Period[]);
        setRole(String((user as { role: string }).role));
      })
      .catch((cause) =>
        setError(cause instanceof ApiError ? cause.message : "Failed to load payroll periods")
      );
  }, []);

  const visible = useMemo(
    () => items.filter((period) => period.year === Number(year) && period.month === Number(month)),
    [items, year, month]
  );

  const eligibility = (period: Period, action = bulkAction) => {
    if (action === "reset")
      return {
        allowed: true,
        reason:
          "ADMIN reset is available; it preserves master employee, salary, attendance, shifts, and punches.",
      };
    if (action === "drafts")
      return period.status === "DRAFT" && period.employee_count === 0 && !period.generated_at
        ? { allowed: true, reason: "Unused DRAFT payroll period." }
        : {
            allowed: false,
            reason:
              "Only unused DRAFT periods can be deleted; generated, approved, paid, cancelled, locked, or record-bearing periods are protected.",
          };
    if (action === "empty-cancelled")
      return period.can_delete_empty_cancelled
        ? { allowed: true, reason: "Safely empty CANCELLED payroll period." }
        : {
            allowed: false,
            reason:
              "Only empty CANCELLED periods without payroll records, payments, slips, or history can be deleted.",
          };
    return period.can_clear_unpaid_test
      ? {
          allowed: true,
          reason:
            "Unpaid eligible test payroll; employee, salary, attendance, shifts, and punches are preserved.",
        }
      : {
          allowed: false,
          reason:
            period.clear_block_reason ??
            "Only unpaid eligible test payrolls can be cleared; protected payroll history remains.",
        };
  };

  const eligibleVisible = visible.filter((period) => eligibility(period).allowed);
  const selectedPeriods = visible.filter((period) => selected.includes(period.id));
  const allChecked = eligibleVisible.length > 0 && eligibleVisible.every((period) => selected.includes(period.id));

  const selectAction = (action: BulkAction) => {
    if (action !== bulkAction) {
      setBulkAction(action);
      setSelected([]);
    }
  };

  const refresh = async () => {
    await load();
    setSelected([]);
  };

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const perform = async (
    period: Period,
    action: "generate" | "recalculate" | "replacement" | "approve"
  ) => {
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      if (action === "replacement") {
        const result = (await apiClient.post(`/payroll/periods/${period.id}/replacement`, {})) as {
          message: string;
        };
        setSuccess(result.message);
      } else {
        await apiClient.post(`/payroll/periods/${period.id}/${action}`, {});
        setSuccess(
          `Payroll ${
            action === "generate"
              ? "generated"
              : action === "recalculate"
                ? "recalculated"
                : "approved"
          }.`
        );
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Payroll action failed");
    } finally {
      setWorking(false);
    }
  };

  const createPeriod = async () => {
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      await apiClient.post("/payroll/periods", { year: Number(year), month: Number(month) });
      setSuccess(`Draft payroll period created for ${month}/${year}.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to create payroll period");
    } finally {
      setWorking(false);
    }
  };

  const runConfirmation = async () => {
    if (!confirm) return;
    if (confirm.action === "reset" && !resetReason.trim()) {
      setError("A reset reason is required.");
      return;
    }
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      if (confirm.action === "cancel") {
        const period = confirm.periods[0];
        await apiClient.post(`/payroll/periods/${period.id}/cancel`, {});
        setSuccess(`Payroll period ${period.month}/${period.year} cancelled and retained as history.`);
      } else if (confirm.action === "pay") {
        const period = confirm.periods[0];
        await apiClient.post(`/payroll/periods/${period.id}/pay`, {
          paymentMethod,
          paymentDate,
          paymentReference: paymentReference || undefined,
        });
        setSuccess(`Payroll period ${period.month}/${period.year} marked as paid.`);
      } else {
        const ids = confirm.periods.map((period) => period.id);
        const endpoint =
          confirm.action === "drafts"
            ? "/payroll/periods/bulk-drafts"
            : confirm.action === "empty-cancelled"
              ? "/payroll/periods/bulk-empty-cancelled"
              : confirm.action === "clear-test"
                ? "/payroll/periods/bulk-clear-test"
                : "/payroll/periods/bulk-reset";

        const result = (await apiClient.delete(endpoint, {
          body: JSON.stringify({
            ids,
            ...(confirm.action === "reset" ? { reason: resetReason } : {}),
          }),
          headers: { "Content-Type": "application/json" },
        })) as { deleted?: number; cleared?: number; skipped?: string[]; blocked?: unknown[] };

        const changed = result.cleared ?? result.deleted ?? 0;
        setSuccess(
          `${
            confirm.action === "drafts" || confirm.action === "empty-cancelled"
              ? "Deleted"
              : "Cleared"
          } ${changed}; skipped ${result.skipped?.length ?? 0}; blocked ${
            result.blocked?.length ?? 0
          }.`
        );
      }
      await refresh();
      setConfirm(null);
      setResetReason("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Payroll action failed");
    } finally {
      setWorking(false);
    }
  };

  const confirmationTitle =
    confirm?.action === "reset"
      ? "Reset selected payrolls, including PAID payrolls?"
      : confirm?.action === "pay"
        ? "Mark payroll as paid?"
        : confirm?.action === "cancel"
          ? "Cancel generated payroll period?"
          : confirm?.action === "drafts"
            ? "Delete selected unused drafts?"
            : confirm?.action === "empty-cancelled"
              ? "Delete selected empty cancelled periods?"
              : "Clear selected test payrolls?";

  const confirmationMessage =
    confirm?.action === "reset"
      ? "This permanently removes selected payroll records, payments, salary slips, deductions, and eligible empty payroll periods. PAID payrolls are included. Employee, salary, attendance, shifts, raw punches, and unrelated advance history remain. A reset reason is required and the action is audited."
      : confirm?.action === "pay"
        ? "This records payment for the approved payroll period and preserves payment history."
        : confirm?.action === "cancel"
          ? "Cancellation preserves the payroll as read-only history."
          : confirm?.action === "drafts"
            ? "Only unused DRAFT periods are deleted. Generated, approved, paid, cancelled, locked, and historical payroll periods stay protected."
            : confirm?.action === "empty-cancelled"
              ? "Only safely empty CANCELLED periods without payroll records or history are deleted."
              : "This removes only eligible unpaid test payroll data. Employee, salary, attendance, shifts, and raw punches are preserved.";

  // Derived metrics for visible periods
  const visibleTotals = useMemo(() => {
    return visible.reduce(
      (acc, p) => ({
        gross: acc.gross + Number(p.gross_total || 0),
        deductions: acc.deductions + Number(p.deduction_total || 0),
        recovery: acc.recovery + Number(p.advance_recovery_total || 0),
        net: acc.net + Number(p.net_pay_total || 0),
        employees: acc.employees + (p.employee_count || 0),
      }),
      { gross: 0, deductions: 0, recovery: 0, net: 0, employees: 0 }
    );
  }, [visible]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Payroll Periods
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Generate, review, approve, and track monthly employee salary disbursements.
          </p>
        </div>

        {/* Year/Month Selectors & Create Period Button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xs">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              Year
              <input
                aria-label="Filter year"
                className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-bold text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
                value={year}
                onChange={(event) => {
                  setYear(event.target.value);
                  setSelected([]);
                }}
              />
            </label>

            <span className="text-slate-300">|</span>

            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              Month
              <select
                aria-label="Filter month"
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-bold text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setSelected([]);
                }}
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index} value={index + 1}>
                    {new Date(2000, index).toLocaleString("en-IN", { month: "long" })}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {payrollEnabled && (
            <button
              disabled={working}
              onClick={() => void createPeriod()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#028174] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#026c61] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-teal-600 focus-visible:outline-offset-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Period
            </button>
          )}
        </div>
      </div>

      {/* Disabled Banner */}
      {!payrollEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900 flex items-center gap-2" role="alert">
          <svg className="h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Payroll module is disabled. Existing periods, salary slips, and payment history are read-only.</span>
        </div>
      )}

      {/* Notifications */}
      {working && (
        <p className="text-sm font-medium text-slate-500" role="status">
          Updating payroll periods…
        </p>
      )}
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Period Summary Cards */}
      {visible.length > 0 && (
        <section aria-label="Selected period summary totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gross Salary</div>
            <div className="mt-1.5 text-lg font-extrabold text-slate-900">{inr(visibleTotals.gross)}</div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Deductions</div>
            <div className="mt-1.5 text-lg font-extrabold text-rose-700">{inr(visibleTotals.deductions)}</div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Advance Recovery</div>
            <div className="mt-1.5 text-lg font-extrabold text-amber-700">{inr(visibleTotals.recovery)}</div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Salary</div>
            <div className="mt-1.5 text-lg font-extrabold text-[#028174]">{inr(visibleTotals.net)}</div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs col-span-2 sm:col-span-1">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employees</div>
            <div className="mt-1.5 text-lg font-extrabold text-slate-900">{visibleTotals.employees}</div>
          </div>
        </section>
      )}

      {/* Main Container */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        {/* Admin Bulk Toolbar */}
        {role === "ADMIN" && payrollEnabled && (
          <div className="border-b border-slate-200/80 px-6 py-3 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="font-semibold text-slate-700">
              {selected.length} selected for{" "}
              {bulkAction === "drafts"
                ? "draft deletion"
                : bulkAction === "empty-cancelled"
                  ? "empty cancelled deletion"
                  : bulkAction === "clear-test"
                    ? "test payroll clearing"
                    : "admin reset"}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 font-semibold transition-colors ${
                  bulkAction === "drafts" ? "bg-slate-200 text-slate-900 border-slate-400" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
                aria-pressed={bulkAction === "drafts"}
                onClick={() => selectAction("drafts")}
              >
                Delete Drafts
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 font-semibold transition-colors ${
                  bulkAction === "empty-cancelled" ? "bg-slate-200 text-slate-900 border-slate-400" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
                aria-pressed={bulkAction === "empty-cancelled"}
                onClick={() => selectAction("empty-cancelled")}
              >
                Delete Empty Cancelled
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 font-semibold transition-colors ${
                  bulkAction === "clear-test" ? "bg-slate-200 text-slate-900 border-slate-400" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
                aria-pressed={bulkAction === "clear-test"}
                onClick={() => selectAction("clear-test")}
              >
                Clear Test Payrolls
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-1.5 font-bold transition-colors ${
                  bulkAction === "reset" ? "bg-rose-100 text-rose-900 border-rose-400" : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                }`}
                aria-pressed={bulkAction === "reset"}
                onClick={() => selectAction("reset")}
              >
                Clear Payrolls
              </button>

              {selected.length > 0 && (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setSelected([])}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Clear Selection
                </button>
              )}

              <button
                type="button"
                disabled={!selectedPeriods.length || working}
                onClick={() => setConfirm({ action: bulkAction, periods: selectedPeriods })}
                className="rounded-lg border border-rose-300 bg-rose-600 px-3.5 py-1.5 font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-rose-600"
              >
                Confirm {bulkAction === "drafts" ? "Delete Drafts" : bulkAction === "empty-cancelled" ? "Delete Empty Cancelled" : bulkAction === "clear-test" ? "Clear Test Payrolls" : "Clear Payrolls"}
              </button>
            </div>
          </div>
        )}

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-[950px] w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {role === "ADMIN" && (
                  <th className="px-4 py-3.5 w-10">
                    <input
                      aria-label="Select all eligible visible payroll periods for the chosen action"
                      type="checkbox"
                      disabled={!payrollEnabled || !eligibleVisible.length}
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? [] : eligibleVisible.map((period) => period.id))}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                )}
                <th className="px-4 py-3.5">Month</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Employees</th>
                <th className="px-4 py-3.5 text-right">Gross Total</th>
                <th className="px-4 py-3.5 text-right">Deductions</th>
                <th className="px-4 py-3.5 text-right">Advance Recovery</th>
                <th className="px-4 py-3.5 text-right">Net Pay</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((period) => {
                const permission = eligibility(period);
                const isChecked = selected.includes(period.id);

                return (
                  <tr key={period.id} className={`transition-colors hover:bg-slate-50/60 ${isChecked ? "bg-teal-50/40" : ""}`}>
                    {role === "ADMIN" && (
                      <td className="px-4 py-3.5">
                        <input
                          aria-label={`Select payroll period ${period.month}/${period.year}`}
                          title={permission.reason}
                          type="checkbox"
                          disabled={!payrollEnabled || !permission.allowed}
                          checked={isChecked}
                          onChange={() => toggle(period.id)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="sr-only">{permission.reason}</span>
                      </td>
                    )}
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      {period.month}/{period.year}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${statusClass(period.status)}`}
                      >
                        {period.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-slate-900">
                      {period.employee_count}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-900">
                      {inr(period.gross_total)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-rose-700">
                      {inr(period.deduction_total)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-amber-700">
                      {inr(period.advance_recovery_total)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-[#028174]">
                      {inr(period.net_pay_total)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {period.status === "DRAFT" && (
                          <>
                            <Link
                              className="inline-flex min-h-[32px] items-center rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-[#028174] hover:bg-[#028174] hover:text-white transition-colors"
                              href={`/payroll/${period.id}`}
                            >
                              Open
                            </Link>
                            {payrollEnabled && (
                              <button
                                disabled={working}
                                className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                                onClick={() => void perform(period, "generate")}
                              >
                                Generate
                              </button>
                            )}
                            {role === "ADMIN" && payrollEnabled && (
                              <button
                                disabled={!eligibility(period, "drafts").allowed || working}
                                title={eligibility(period, "drafts").reason}
                                className="min-h-[32px] rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                                onClick={() => setConfirm({ action: "drafts", periods: [period] })}
                              >
                                Delete Draft
                              </button>
                            )}
                          </>
                        )}

                        {period.status === "GENERATED" && (
                          <>
                            <Link
                              className="inline-flex min-h-[32px] items-center rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-[#028174] hover:bg-[#028174] hover:text-white transition-colors"
                              href={`/payroll/${period.id}`}
                            >
                              Open
                            </Link>
                            {payrollEnabled && (
                              <button
                                disabled={working}
                                className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                                onClick={() => void perform(period, "recalculate")}
                              >
                                Recalculate
                              </button>
                            )}
                            {role === "ADMIN" && payrollEnabled && (
                              <>
                                <button
                                  disabled={working}
                                  className="min-h-[32px] rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                                  onClick={() => void perform(period, "approve")}
                                >
                                  Approve
                                </button>
                                <button
                                  disabled={working}
                                  className="min-h-[32px] rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                                  onClick={() => setConfirm({ action: "cancel", periods: [period] })}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </>
                        )}

                        {period.status === "APPROVED" && (
                          <>
                            <Link
                              className="inline-flex min-h-[32px] items-center rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-[#028174] hover:bg-[#028174] hover:text-white transition-colors"
                              href={`/payroll/${period.id}`}
                            >
                              Open
                            </Link>
                            {role === "ADMIN" && payrollEnabled && (
                              <button
                                disabled={working}
                                className="min-h-[32px] rounded-lg border border-emerald-400 bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                onClick={() => setConfirm({ action: "pay", periods: [period] })}
                              >
                                Mark as Paid
                              </button>
                            )}
                          </>
                        )}

                        {period.status === "PAID" && (
                          <>
                            <Link
                              className="inline-flex min-h-[32px] items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                              href={`/payroll/${period.id}`}
                            >
                              Open History
                            </Link>
                          </>
                        )}

                        {period.status === "CANCELLED" && (
                          <>
                            <Link
                              className="inline-flex min-h-[32px] items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                              href={`/payroll/${period.id}`}
                            >
                              Open History
                            </Link>
                            {role === "ADMIN" && payrollEnabled && (
                              <button
                                disabled={working}
                                className="min-h-[32px] rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-[#028174] hover:bg-[#028174] hover:text-white disabled:opacity-50 transition-colors"
                                onClick={() => void perform(period, "replacement")}
                              >
                                Create Replacement
                              </button>
                            )}
                          </>
                        )}

                        {period.status === "LOCKED" && (
                          <Link
                            className="inline-flex min-h-[32px] items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                            href={`/payroll/${period.id}`}
                          >
                            Open History
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!visible.length && (
                <tr>
                  <td colSpan={role === "ADMIN" ? 9 : 8} className="px-6 py-12 text-center text-sm text-slate-500">
                    No payroll periods found for the selected year and month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (768px and below) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {visible.map((period) => {
            const permission = eligibility(period);
            const isChecked = selected.includes(period.id);

            return (
              <div key={period.id} className={`p-4 space-y-3 ${isChecked ? "bg-teal-50/40" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {role === "ADMIN" && (
                      <input
                        aria-label={`Select payroll period ${period.month}/${period.year}`}
                        title={permission.reason}
                        type="checkbox"
                        disabled={!payrollEnabled || !permission.allowed}
                        checked={isChecked}
                        onChange={() => toggle(period.id)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                    )}
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Period {period.month}/{period.year}
                      </h3>
                      <div className="text-xs text-slate-500">
                        {period.employee_count} employees
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border ${statusClass(period.status)}`}
                  >
                    {period.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Gross Total:</span>
                    <span className="font-semibold text-slate-900">{inr(period.gross_total)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Net Salary:</span>
                    <span className="font-bold text-[#028174]">{inr(period.net_pay_total)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Deductions:</span>
                    <span className="font-semibold text-rose-700">{inr(period.deduction_total)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Advance Recovery:</span>
                    <span className="font-semibold text-amber-700">{inr(period.advance_recovery_total)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Link
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-50 border border-teal-200 text-xs font-bold text-[#028174]"
                    href={`/payroll/${period.id}`}
                  >
                    View Details
                  </Link>

                  {period.status === "DRAFT" && payrollEnabled && (
                    <button
                      disabled={working}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
                      onClick={() => void perform(period, "generate")}
                    >
                      Generate
                    </button>
                  )}

                  {period.status === "GENERATED" && role === "ADMIN" && payrollEnabled && (
                    <button
                      disabled={working}
                      className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-xs font-bold text-white"
                      onClick={() => void perform(period, "approve")}
                    >
                      Approve
                    </button>
                  )}

                  {period.status === "APPROVED" && role === "ADMIN" && payrollEnabled && (
                    <button
                      disabled={working}
                      className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-xs font-bold text-white"
                      onClick={() => setConfirm({ action: "pay", periods: [period] })}
                    >
                      Mark as Paid
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {!visible.length && (
            <div className="p-8 text-center text-sm text-slate-500">
              No payroll periods found for the selected year and month.
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={confirm !== null}
        pending={working}
        recordName="payroll periods"
        title={confirmationTitle}
        message={confirmationMessage}
        confirmLabel={
          confirm?.action === "reset"
            ? "Reset Selected Payrolls"
            : confirm?.action === "pay"
              ? "Mark as Paid"
              : confirm?.action === "cancel"
                ? "Cancel Payroll"
                : confirm?.action === "drafts"
                  ? "Delete Drafts"
                  : confirm?.action === "empty-cancelled"
                    ? "Delete Empty Cancelled"
                    : "Clear Test Payrolls"
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirmation()}
      >
        {confirm?.action === "reset" && (
          <textarea
            aria-label="Reset reason"
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
            placeholder="Reset reason (required)"
            value={resetReason}
            onChange={(event) => setResetReason(event.target.value)}
          />
        )}
        {confirm?.action === "pay" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Payment method
              </label>
              <select
                aria-label="Payment method"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                {["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "OTHER"].map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Payment date
              </label>
              <input
                aria-label="Payment date"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Reference
              </label>
              <input
                aria-label="Reference"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus-visible:outline-2 focus-visible:outline-teal-600"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </div>
          </div>
        )}
      </ConfirmationModal>
    </div>
  );
}
