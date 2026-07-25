"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

type Device = {
  id: string;
  device_code: string;
  name: string | null;
  model: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  active: boolean;
  status: "ONLINE" | "OFFLINE";
  last_seen: string | null;
  last_sync: string | null;
  last_ip: string | null;
  last_raw_punch_time: string | null;
  last_raw_punch_received: string | null;
};

const empty = { device_code: "", name: "", model: "MB160", serial_number: "", firmware_version: "" };

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<Device | null>(null);
  const [role, setRole] = useState("MANAGER");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async (deviceId = selected?.id) => {
    setLoading(true);
    setError("");
    try {
      const [list, user] = await Promise.all([apiClient.get("/devices"), apiClient.get("/auth/me")]);
      const rows = list as Device[];
      const next = deviceId ? rows.find((device) => device.id === deviceId) ?? rows[0] : rows[0];
      setDevices(rows);
      setRole(String((user as { role: string }).role));
      setSelected(next ?? null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to load biometric devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const choose = (device: Device) => {
    setError("");
    setMessage("");
    setSelected(device);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]));
      if (editing && selected) {
        await apiClient.patch(`/devices/${selected.id}`, payload);
        setMessage("Biometric device configuration updated successfully.");
      } else {
        await apiClient.post("/devices", payload);
        setMessage("New biometric device registered successfully.");
      }
      setEditing(false);
      setForm(empty);
      await load(selected?.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to save device details");
    }
  };

  const edit = () => {
    if (selected) {
      setEditing(true);
      setForm({
        device_code: selected.device_code,
        name: selected.name ?? "",
        model: selected.model ?? "",
        serial_number: selected.serial_number ?? "",
        firmware_version: selected.firmware_version ?? "",
      });
    }
  };

  const toggle = async () => {
    if (!selected) return;
    setError("");
    setMessage("");
    try {
      await apiClient.patch(`/devices/${selected.id}/${selected.active ? "deactivate" : "activate"}`, {});
      setMessage(`Device ${selected.name || selected.device_code} ${selected.active ? "deactivated" : "activated"} successfully.`);
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to change device active state");
    }
  };

  const onlineCount = devices.filter((d) => d.status === "ONLINE").length;
  const offlineCount = devices.filter((d) => d.status === "OFFLINE").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Biometric Devices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor connection health, machine status, and hardware configuration for hotel attendance
          </p>
        </div>
        {role === "ADMIN" && (
          <button
            id="btn-add-device"
            type="button"
            onClick={() => {
              setEditing(true);
              setSelected(null);
              setForm(empty);
              setError("");
              setMessage("");
            }}
            className="min-h-[44px] sm:min-h-[38px] inline-flex justify-center items-center px-4 py-2 bg-[#028174] hover:bg-[#026c61] text-white font-medium text-sm rounded-lg shadow-sm transition-colors shrink-0"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Device
          </button>
        )}
      </div>

      {/* KPI Overview Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Machines</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{devices.length}</div>
          <div className="text-xs text-gray-500 mt-1">Registered hardware</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Online Machines</span>
          </div>
          <div className="text-2xl font-bold text-emerald-800 mt-1">{onlineCount}</div>
          <div className="text-xs text-emerald-600 mt-1">Connected &amp; heartbeating</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="text-xs font-medium text-red-700 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Offline Machines</span>
          </div>
          <div className="text-2xl font-bold text-red-800 mt-1">{offlineCount}</div>
          <div className="text-xs text-red-600 mt-1">Connection timed out</div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 col-span-2 lg:col-span-1">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Timezone Context</div>
          <div className="text-sm font-semibold text-gray-900 mt-1">Asia/Kolkata (IST)</div>
          <div className="text-xs text-gray-500 mt-1">UTC+05:30 Standard Time</div>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-[#DC2626] rounded-lg text-sm flex items-center gap-2" role="alert">
          <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm flex items-center gap-2" role="status">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{message}</span>
        </div>
      )}

      {/* Add / Edit Device Form */}
      {editing && role === "ADMIN" && (
        <form onSubmit={save} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-lg font-semibold text-gray-900">{selected ? "Edit Machine Configuration" : "Add New Biometric Machine"}</h2>
            <span className="text-xs text-gray-500">* Required field</span>
          </div>

          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Device Code *
            <input
              required
              placeholder="e.g. DEV01"
              value={form.device_code}
              onChange={(event) => setForm({ ...form, device_code: event.target.value })}
              className="block mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#028174] focus:border-transparent font-mono"
            />
          </label>

          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Device Name
            <input
              placeholder="e.g. Main Lobby Gate 1"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="block mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#028174] focus:border-transparent"
            />
          </label>

          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Machine Model
            <input
              placeholder="e.g. MB160"
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
              className="block mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#028174] focus:border-transparent"
            />
          </label>

          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Serial Number
            <input
              placeholder="e.g. SN-8924012"
              value={form.serial_number}
              onChange={(event) => setForm({ ...form, serial_number: event.target.value })}
              className="block mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#028174] focus:border-transparent font-mono"
            />
          </label>

          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide md:col-span-2">
            Firmware Version
            <input
              placeholder="e.g. v2.4.1"
              value={form.firmware_version}
              onChange={(event) => setForm({ ...form, firmware_version: event.target.value })}
              className="block mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#028174] focus:border-transparent font-mono"
            />
          </label>

          <div className="md:col-span-2 flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-[44px] sm:min-h-[38px] px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] sm:min-h-[38px] px-5 py-2 bg-[#028174] hover:bg-[#026c61] text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Save Machine Details
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-200 text-center text-gray-500 text-sm">
          <div className="animate-spin w-8 h-8 border-4 border-[#028174] border-t-transparent rounded-full mx-auto mb-3" />
          Loading biometric machines status…
        </div>
      ) : devices.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-200 text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-2xl font-bold">
            📟
          </div>
          <h3 className="text-lg font-medium text-gray-900">No Biometric Machines Configured</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            No biometric machines have been registered in the system yet. Once connected, machines will report status here.
          </p>
          {role === "ADMIN" && (
            <button
              onClick={() => {
                setEditing(true);
                setSelected(null);
                setForm(empty);
              }}
              className="inline-flex items-center px-4 py-2 bg-[#028174] text-white text-sm font-medium rounded-lg hover:bg-[#026c61]"
            >
              Add First Device
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Machines Selector Sidebar / List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-200 h-fit">
            <div className="p-4 bg-gray-50/80 rounded-t-xl font-semibold text-xs text-gray-500 uppercase tracking-wider flex items-center justify-between">
              <span>Connected Machines</span>
              <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-mono text-[11px]">{devices.length}</span>
            </div>
            {devices.map((device) => {
              const isOnline = device.status === "ONLINE";
              const isSelected = selected?.id === device.id;
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => choose(device)}
                  className={`w-full text-left p-4 transition-colors flex items-center justify-between min-h-[44px] ${
                    isSelected ? "bg-emerald-50/70 border-l-4 border-l-[#028174]" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-gray-900 text-sm">{device.name || device.device_code}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1.5 font-mono">
                      <span>{device.model || "MB160"}</span>
                      <span>·</span>
                      <span>{device.device_code}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      isOnline ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-red-100 text-red-800 border border-red-300"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-600" : "bg-red-600"}`} />
                    {device.status}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected Machine Detail Panel */}
          <div className="lg:col-span-2">
            {selected ? (
              <div id="device-card" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
                {/* Card Header & Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-xl font-bold text-gray-900">{selected.name || selected.device_code}</h2>
                      <span
                        id="device-status-badge"
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          selected.status === "ONLINE"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-red-100 text-red-800 border border-red-300"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${selected.status === "ONLINE" ? "bg-emerald-600 animate-pulse" : "bg-red-600"}`} />
                        {selected.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono">Device Code: {selected.device_code}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      id="btn-refresh-status"
                      type="button"
                      onClick={() => void load(selected.id)}
                      className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Status
                    </button>
                    {role === "ADMIN" && (
                      <>
                        <button
                          id="btn-edit-device"
                          type="button"
                          onClick={edit}
                          className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          id="btn-toggle-device-active"
                          type="button"
                          onClick={() => void toggle()}
                          className={`min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white rounded-lg transition-colors ${
                            selected.active ? "bg-[#DC2626] hover:bg-[#B91C1C]" : "bg-[#0AB68B] hover:bg-[#089774]"
                          }`}
                        >
                          {selected.active ? "Deactivate" : "Activate"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Status Notice Banner */}
                <div
                  className={`p-4 rounded-lg text-xs border flex items-start gap-3 ${
                    selected.status === "ONLINE"
                      ? "bg-emerald-50/80 text-emerald-900 border-emerald-200"
                      : "bg-red-50/80 text-red-900 border-red-200"
                  }`}
                >
                  <span className="text-base">{selected.status === "ONLINE" ? "🟢" : "🔴"}</span>
                  <div className="space-y-0.5">
                    <div className="font-semibold">
                      {selected.status === "ONLINE" ? "Machine Online & Connected" : "Machine Connection Offline"}
                    </div>
                    <p className="leading-relaxed">
                      {selected.status === "ONLINE"
                        ? "Machine is actively heartbeating and transmitting attendance punches to the server in real-time."
                        : "Machine has not communicated with the server within the heartbeat window (15 minutes). Verify machine power and IP network connectivity."}
                    </p>
                  </div>
                </div>

                {/* Specifications Grid */}
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  {[
                    ["Device Name", selected.name || "—"],
                    ["Model", selected.model || "—"],
                    ["Device Code", selected.device_code],
                    ["Serial Number", selected.serial_number || "—"],
                    ["Online / Offline Status", selected.status],
                    ["Last IP", selected.last_ip || "—"],
                    ["Last Seen", formatDateTime(selected.last_seen)],
                    ["Last Sync", formatDateTime(selected.last_sync)],
                    ["Last Raw Punch Time", formatDateTime(selected.last_raw_punch_time ?? selected.last_raw_punch_received)],
                    ["Firmware", selected.firmware_version || "—"],
                    ["Active / Inactive Status", selected.active ? "Active" : "Inactive"],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
                      <dd className="mt-1 font-semibold text-gray-900">{val}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center text-gray-500 text-sm">
                Select a biometric machine from the list to inspect hardware and network status.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
