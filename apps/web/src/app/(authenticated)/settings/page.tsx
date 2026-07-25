"use client";

import { useEffect, useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { usePayrollModule } from "@/components/payroll-module-context";
import { apiClient } from "@/lib/api-client";

export default function SettingsPage() {
  const { payrollEnabled: enabled, setPayrollEnabled } = usePayrollModule();
  const [role, setRole] = useState("");
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void apiClient.get("/auth/me").then((u) => setRole(String((u as { role: string }).role)));
  }, []);

  const toggle = async () => {
    const previous = enabled;
    const next = !previous;
    setPending(true);
    setMsg("");
    setErrorMsg("");
    setPayrollEnabled(next);
    try {
      const updated = (await apiClient.patch("/settings/modules/payroll", { enabled: next })) as { enabled: boolean };
      setPayrollEnabled(updated.enabled);
      setMsg("Payroll module status updated successfully.");
      setOpen(false);
    } catch (e) {
      setPayrollEnabled(previous);
      setErrorMsg((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const disabling = enabled;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">System &amp; Module Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage application modules, operational standards, and system configuration preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            System Operational
          </span>
        </div>
      </div>

      {/* Alert Messages */}
      {msg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm flex items-center gap-2" role="status">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{msg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-[#DC2626] rounded-lg text-sm flex items-center gap-2" role="alert">
          <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module Management Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-[#028174] flex items-center justify-center font-bold text-lg">
                🧩
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Application Modules</h2>
                <p className="text-xs text-gray-500">Enable or disable optional system feature modules</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50/70 p-5 rounded-lg border border-gray-200/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 text-base">Payroll Module</h3>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      enabled ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-gray-200 text-gray-700 border border-gray-300"
                    }`}
                  >
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Manages monthly salary calculations, attendance deductions, advances recovery, payment approvals, and PDF salary slips.
                </p>
              </div>

              {role === "ADMIN" && (
                <button
                  id="btn-toggle-payroll"
                  type="button"
                  onClick={() => setOpen(true)}
                  className={`min-h-[44px] sm:min-h-[38px] px-4 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 ${
                    enabled
                      ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                      : "bg-[#028174] text-white hover:bg-[#026c61] shadow-sm"
                  }`}
                >
                  {enabled ? "Disable Payroll" : "Enable Payroll"}
                </button>
              )}
            </div>

            <div className="text-xs text-gray-500 pt-2 border-t border-gray-200/60 flex items-center gap-1.5">
              <span>ℹ️</span>
              <span>
                {enabled
                  ? "Disabling payroll hides management menus but preserves past records safely."
                  : "Enabling payroll reactivates salary slips, period approvals, and disbursements."}
              </span>
            </div>
          </div>
        </div>

        {/* Hotel & Regional Standards Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 text-[#028174] flex items-center justify-center font-bold text-lg">
                🏨
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Hotel &amp; Regional Information</h2>
                <p className="text-xs text-gray-500">Property metadata and regional display preferences</p>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50/50 p-3.5 rounded-lg border border-gray-100">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hotel Property Name</dt>
              <dd className="mt-1 font-semibold text-gray-900">Ranjirams Hotel</dd>
            </div>
            <div className="bg-gray-50/50 p-3.5 rounded-lg border border-gray-100">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Timezone Standard</dt>
              <dd className="mt-1 font-semibold text-gray-900 flex items-center gap-1.5">
                <span>Asia/Kolkata</span>
                <span className="text-xs font-normal text-gray-500">(IST · UTC+05:30)</span>
              </dd>
            </div>
            <div className="bg-gray-50/50 p-3.5 rounded-lg border border-gray-100">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Currency Display</dt>
              <dd className="mt-1 font-semibold text-gray-900">Indian Rupee (₹ INR)</dd>
            </div>
            <div className="bg-gray-50/50 p-3.5 rounded-lg border border-gray-100">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Property Region</dt>
              <dd className="mt-1 font-semibold text-gray-900">Tamil Nadu, India</dd>
            </div>
          </dl>

          <div className="p-3 bg-amber-50/80 border border-amber-200/60 rounded-lg text-xs text-amber-800 space-y-1">
            <div className="font-semibold flex items-center gap-1">
              <span>🕒</span>
              <span>Timezone Policy Notice</span>
            </div>
            <p className="leading-relaxed">
              All biometric punches, daily attendance records, shift schedules, and PDF salary slips are processed and rendered strictly in India Standard Time (IST).
            </p>
          </div>
        </div>

        {/* Operational & Attendance Policy Configuration Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
                ⚙️
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Attendance &amp; Biometric Policy Standards</h2>
                <p className="text-xs text-gray-500">System rules governing punch pairing, shift grace periods, and device monitoring</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="bg-gray-50/60 p-4 rounded-lg border border-gray-200/70 space-y-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Shift Grace Period</div>
              <div className="text-xl font-bold text-gray-900">15 minutes</div>
              <p className="text-xs text-gray-500 mt-1">Late arrival tolerance before marking LATE status</p>
            </div>

            <div className="bg-gray-50/60 p-4 rounded-lg border border-gray-200/70 space-y-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Min Work Duration</div>
              <div className="text-xl font-bold text-gray-900">8 hours</div>
              <p className="text-xs text-gray-500 mt-1">Minimum required working minutes (480 mins) per full shift</p>
            </div>

            <div className="bg-gray-50/60 p-4 rounded-lg border border-gray-200/70 space-y-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Device Heartbeat Interval</div>
              <div className="text-xl font-bold text-gray-900">15 minutes</div>
              <p className="text-xs text-gray-500 mt-1">Offline threshold for biometric machine communication</p>
            </div>

            <div className="bg-gray-50/60 p-4 rounded-lg border border-gray-200/70 space-y-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Duplicate Punch Guard</div>
              <div className="text-xl font-bold text-gray-900">Active</div>
              <p className="text-xs text-gray-500 mt-1">Ignores rapid repeated biometric swipes within window</p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={open}
        pending={pending}
        recordName="Payroll"
        title={disabling ? "Disable Payroll?" : "Enable Payroll?"}
        message={
          disabling
            ? "Disable Payroll? Existing payroll history will be preserved as read-only. Attendance, salary and advance modules will continue working."
            : "Enable Payroll? Existing payroll history and payroll management will become available again."
        }
        confirmLabel={disabling ? "Disable Payroll" : "Enable Payroll"}
        onCancel={() => setOpen(false)}
        onConfirm={() => void toggle()}
      />
    </div>
  );
}
