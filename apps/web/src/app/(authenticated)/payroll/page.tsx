"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ConfirmationModal } from "@/components/confirmation-modal";
import { ApiError, apiClient } from "@/lib/api-client";

type PeriodStatus = "DRAFT" | "GENERATED" | "LOCKED" | "CANCELLED" | "PAID";
type Period = { id: string; year: number; month: number; status: PeriodStatus; employee_count: number; generated_at?: string | null; gross_total: string; deduction_total: string; advance_recovery_total: string; net_pay_total: string };
type Confirmation = { action: "delete"; periods: Period[] } | { action: "cancel"; periods: [Period] };

const inr = (value: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value ?? 0));
const statusClass = (status: PeriodStatus) => status === "CANCELLED" ? "bg-red-100 text-red-800" : status === "LOCKED" || status === "PAID" ? "bg-slate-200 text-slate-800" : status === "GENERATED" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800";

export default function PayrollPage() {
  const [items, setItems] = useState<Period[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [role, setRole] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [working, setWorking] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const [periods, user] = await Promise.all([apiClient.get("/payroll/periods"), apiClient.get("/auth/me")]);
    setItems(periods as Period[]);
    setRole(String((user as { role: string }).role));
  };

  useEffect(() => {
    Promise.all([apiClient.get("/payroll/periods"), apiClient.get("/auth/me")])
      .then(([periods, user]) => {
        setItems(periods as Period[]);
        setRole(String((user as { role: string }).role));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : "Failed to load payroll periods"));
  }, []);

  const visibleItems = useMemo(() => items.filter((period) => period.year === Number(year) && period.month === Number(month)), [items, year, month]);
  const isUnusedDraft = (period: Period) => period.status === "DRAFT" && period.employee_count === 0 && !period.generated_at;
  const selectablePeriods = visibleItems.filter(isUnusedDraft);
  const allSelected = selectablePeriods.length > 0 && selectablePeriods.every((period) => selected.includes(period.id));
  const toggleSelected = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  const refresh = async () => {
    await load();
    setSelected([]);
  };
  const run = async (period: Period, action: "generate" | "recalculate" | "replacement") => {
    setWorking(true); setError(""); setSuccess("");
    try {
      if (action === "replacement") await apiClient.post("/payroll/periods", { year: period.year, month: period.month });
      else await apiClient.post(`/payroll/periods/${period.id}/${action}`, {});
      setSuccess(action === "replacement" ? `Replacement draft created for ${period.month}/${period.year}.` : `Payroll ${action === "generate" ? "generated" : "recalculated"}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Payroll action failed"); }
    finally { setWorking(false); }
  };
  const runConfirmation = async () => {
    if (!confirm) return;
    setWorking(true); setError(""); setSuccess("");
    try {
      if (confirm.action === "delete") {
        const ids = confirm.periods.map((period) => period.id);
        const result = await apiClient.delete("/payroll/periods/bulk-drafts", { body: JSON.stringify({ ids }), headers: { "Content-Type": "application/json" } }) as { deleted?: number };
        setSuccess(`${result.deleted ?? 0} unused draft payroll period${result.deleted === 1 ? "" : "s"} deleted.`);
      } else {
        const period = confirm.periods[0];
        await apiClient.post(`/payroll/periods/${period.id}/cancel`, {});
        setSuccess(`Payroll period ${period.month}/${period.year} cancelled and preserved as history.`);
      }
      await refresh();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Payroll action failed"); }
    finally { setWorking(false); setConfirm(null); }
  };
  const createPeriod = async () => {
    setWorking(true); setError(""); setSuccess("");
    try {
      await apiClient.post("/payroll/periods", { year: Number(year), month: Number(month) });
      setSuccess(`Draft payroll period created for ${month}/${year}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Unable to create payroll period"); }
    finally { setWorking(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><h1 className="text-2xl font-bold">Payroll Periods</h1><div className="flex flex-wrap gap-2"><label className="text-sm">Year<input aria-label="Filter year" className="ml-1 border p-2 w-24" value={year} onChange={(event) => { setYear(event.target.value); setSelected([]); }} /></label><label className="text-sm">Month<select aria-label="Filter month" className="ml-1 border p-2" value={month} onChange={(event) => { setMonth(event.target.value); setSelected([]); }}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{new Date(2000, index).toLocaleString("en-IN", { month: "long" })}</option>)}</select></label><button disabled={working} className="bg-blue-600 text-white px-3 rounded disabled:opacity-50" onClick={() => void createPeriod()}>Create Period</button></div></div>
    {working && <p className="text-sm text-gray-500" role="status">Updating payroll periods…</p>}
    {success && <p className="p-3 rounded bg-green-50 text-green-800" role="status">{success}</p>}{error && <p className="p-3 rounded bg-red-100 text-red-800" role="alert">{error}</p>}
    <div className="bg-white rounded shadow overflow-x-auto">
      {role === "ADMIN" && <div className="border-b px-4 py-2 flex flex-wrap items-center gap-2 text-xs"><span className="mr-1">{selected.length} selected</span><button disabled={!selected.length || working} className="border rounded px-2 py-1 text-red-700 disabled:opacity-50" onClick={() => setConfirm({ action: "delete", periods: visibleItems.filter((period) => selected.includes(period.id)) })}>Delete Selected Drafts</button><button disabled={!selected.length || working} className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setSelected([])}>Clear Selection</button></div>}
      <table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-50"><tr>{role === "ADMIN" && <th className="px-4 py-3"><input aria-label="Select all visible unused draft payroll periods" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : selectablePeriods.map((period) => period.id))} /></th>}{["Month", "Status", "Employees", "Gross", "Deductions", "Recovery", "Net", "Actions"].map((label) => <th key={label} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{label}</th>)}</tr></thead><tbody>{visibleItems.map((period) => <tr className="border-t" key={period.id}>{role === "ADMIN" && <td className="px-4 py-3"><input aria-label={`Select payroll period ${period.month}/${period.year}`} type="checkbox" disabled={!isUnusedDraft(period)} checked={selected.includes(period.id)} onChange={() => toggleSelected(period.id)} /></td>}<td className="px-4 py-3 whitespace-nowrap">{period.month}/{period.year}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(period.status)}`}>{period.status}</span></td><td className="px-4 py-3 text-right">{period.employee_count}</td><td className="px-4 py-3 text-right">{inr(period.gross_total)}</td><td className="px-4 py-3 text-right">{inr(period.deduction_total)}</td><td className="px-4 py-3 text-right">{inr(period.advance_recovery_total)}</td><td className="px-4 py-3 text-right">{inr(period.net_pay_total)}</td><td className="px-4 py-3 whitespace-nowrap"><div className="flex flex-wrap gap-1">{period.status === "DRAFT" && <><Link className="border rounded px-2 py-1 text-xs text-blue-700" href={`/payroll/${period.id}`}>Open</Link><button disabled={working} className="border rounded px-2 py-1 text-xs disabled:opacity-50" onClick={() => void run(period, "generate")}>Generate</button>{role === "ADMIN" && <button disabled={!isUnusedDraft(period) || working} title={!isUnusedDraft(period) ? "Only unused draft periods can be deleted" : undefined} className="border rounded px-2 py-1 text-xs text-red-700 disabled:opacity-50" onClick={() => setConfirm({ action: "delete", periods: [period] })}>Delete Draft</button>}</>}{period.status === "GENERATED" && <><Link className="border rounded px-2 py-1 text-xs text-blue-700" href={`/payroll/${period.id}`}>Open</Link><button disabled={working} className="border rounded px-2 py-1 text-xs disabled:opacity-50" onClick={() => void run(period, "recalculate")}>Recalculate</button>{role === "ADMIN" && <button disabled={working} className="border rounded px-2 py-1 text-xs text-red-700 disabled:opacity-50" onClick={() => setConfirm({ action: "cancel", periods: [period] })}>Cancel</button>}</>}{(period.status === "LOCKED" || period.status === "PAID") && <Link className="border rounded px-2 py-1 text-xs text-blue-700" href={`/payroll/${period.id}`}>Open History</Link>}{period.status === "CANCELLED" && <><Link className="border rounded px-2 py-1 text-xs text-blue-700" href={`/payroll/${period.id}`}>Open History</Link><button disabled={working} className="border rounded px-2 py-1 text-xs disabled:opacity-50" onClick={() => void run(period, "replacement")}>Create Replacement</button></>}</div></td></tr>)}{!visibleItems.length && <tr><td colSpan={role === "ADMIN" ? 9 : 8} className="px-4 py-6 text-center text-gray-500">No payroll periods found for the selected year and month.</td></tr>}</tbody></table>
    </div>
    <ConfirmationModal open={confirm !== null} pending={working} recordName="payroll periods" title={confirm?.action === "cancel" ? "Cancel generated payroll period?" : "Delete unused draft payroll period(s)?"} message={confirm?.action === "cancel" ? "Cancellation preserves this payroll as read-only history. It cannot be deleted." : "Only unused DRAFT periods can be deleted. GENERATED, LOCKED, CANCELLED, PAID, and all historical payroll records remain protected."} confirmLabel={confirm?.action === "cancel" ? "Cancel Payroll" : "Delete Drafts"} onCancel={() => setConfirm(null)} onConfirm={() => void runConfirmation()} />
  </div>;
}
