"use client";

import { useEffect, useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { usePayrollModule } from "@/components/payroll-module-context";
import { apiClient } from "@/lib/api-client";

export default function Settings() {
  const { payrollEnabled: enabled, setPayrollEnabled } = usePayrollModule();
  const [role, setRole] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => { void apiClient.get("/auth/me").then((u) => setRole(String((u as { role: string }).role))); }, []);

  const toggle = async () => {
    const previous = enabled;
    const next = !previous;
    setPending(true);
    setPayrollEnabled(next);
    try {
      const updated = await apiClient.patch("/settings/modules/payroll", { enabled: next }) as { enabled: boolean };
      setPayrollEnabled(updated.enabled);
      setMsg("Payroll module updated.");
      setOpen(false);
    } catch (e) {
      setPayrollEnabled(previous);
      setMsg((e as Error).message);
    } finally { setPending(false); }
  };

  const disabling = enabled;
  return <div className="max-w-xl space-y-4"><h1 className="text-2xl font-bold">Module Settings</h1><div className="bg-white rounded shadow p-5"><h2 className="font-semibold">Payroll Module</h2><p>Status: <b>{enabled ? "Enabled" : "Disabled"}</b></p>{msg && <p className="mt-2">{msg}</p>}{role === "ADMIN" && <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded" onClick={() => setOpen(true)}>{enabled ? "Disable Payroll" : "Enable Payroll"}</button>}</div><ConfirmationModal open={open} pending={pending} recordName="Payroll" title={disabling ? "Disable Payroll?" : "Enable Payroll?"} message={disabling ? "Disable Payroll? Existing payroll history will be preserved as read-only. Attendance, salary and advance modules will continue working." : "Enable Payroll? Existing payroll history and payroll management will become available again."} confirmLabel={disabling ? "Disable Payroll" : "Enable Payroll"} onCancel={() => setOpen(false)} onConfirm={() => void toggle()}/></div>;
}
