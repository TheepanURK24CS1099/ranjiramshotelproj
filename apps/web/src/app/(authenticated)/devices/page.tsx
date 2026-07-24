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
        setMessage("Device updated successfully.");
      } else {
        await apiClient.post("/devices", payload);
        setMessage("Device added successfully.");
      }
      setEditing(false);
      setForm(empty);
      await load(selected?.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to save device");
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
      setMessage(`Device ${selected.active ? "deactivated" : "activated"} successfully.`);
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to update device");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Biometric Devices</h1>
          <p className="text-sm text-gray-500">View and manage biometric attendance machines</p>
        </div>
        {role === "ADMIN" && (
          <button
            id="btn-add-device"
            onClick={() => {
              setEditing(true);
              setSelected(null);
              setForm(empty);
              setError("");
              setMessage("");
            }}
            className="inline-flex justify-center items-center px-4 py-2 bg-[#028174] hover:bg-[#026c61] text-white font-medium text-sm rounded shadow-sm transition-colors"
          >
            Add Device
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-[#DC2626] rounded-md text-sm" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-md text-sm" role="status">
          {message}
        </div>
      )}

      {editing && role === "ADMIN" && (
        <form onSubmit={save} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          <h2 className="md:col-span-2 text-lg font-semibold text-gray-900">{selected ? "Edit Device" : "Add New Device"}</h2>
          {Object.keys(empty).map((key) => (
            <label key={key} className="text-sm font-medium text-gray-700 capitalize">
              {key.replaceAll("_", " ")}
              {key === "device_code" && " *"}
              <input
                required={key === "device_code"}
                value={form[key as keyof typeof form]}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                className="block mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#028174] focus:border-transparent"
              />
            </label>
          ))}
          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#028174] hover:bg-[#026c61] text-white rounded-md text-sm font-medium transition-colors"
            >
              Save Device
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center text-gray-500 text-sm">
          Loading biometric devices…
        </div>
      ) : devices.length === 0 ? (
        <div className="bg-white p-12 rounded-lg shadow-sm border border-gray-200 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xl font-bold">
            📟
          </div>
          <h3 className="text-lg font-medium text-gray-900">No biometric devices configured</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            No devices have been added to the system yet. Once connected, machines will appear here.
          </p>
          {role === "ADMIN" && (
            <button
              onClick={() => {
                setEditing(true);
                setSelected(null);
                setForm(empty);
              }}
              className="inline-flex items-center px-4 py-2 bg-[#028174] text-white text-sm font-medium rounded-md hover:bg-[#026c61]"
            >
              Add Your First Device
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Device Selection List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200 h-fit">
            <div className="p-4 bg-gray-50 rounded-t-lg font-medium text-xs text-gray-500 uppercase tracking-wider">
              Connected Machines ({devices.length})
            </div>
            {devices.map((device) => (
              <button
                key={device.id}
                onClick={() => choose(device)}
                className={`w-full text-left p-4 transition-colors flex items-center justify-between ${
                  selected?.id === device.id ? "bg-emerald-50/60 border-l-4 border-l-[#028174]" : "hover:bg-gray-50"
                }`}
              >
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{device.name || device.device_code}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {device.model || "MB160"} · <span className="font-mono">{device.device_code}</span>
                  </div>
                </div>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                    device.status === "ONLINE"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {device.status}
                </span>
              </button>
            ))}
          </div>

          {/* Selected Device Details */}
          <div className="lg:col-span-2">
            {selected ? (
              <div id="device-card" className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6">
                {/* Device Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-xl font-bold text-gray-900">{selected.name || selected.device_code}</h2>
                      <span
                        id="device-status-badge"
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          selected.status === "ONLINE"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-red-100 text-red-800 border border-red-300"
                        }`}
                      >
                        {selected.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono">Code: {selected.device_code}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      id="btn-refresh-status"
                      onClick={() => void load(selected.id)}
                      className="px-3 py-1.5 border border-gray-300 rounded text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Refresh Status
                    </button>
                    {role === "ADMIN" && (
                      <>
                        <button
                          id="btn-edit-device"
                          onClick={edit}
                          className="px-3 py-1.5 border border-gray-300 rounded text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          id="btn-toggle-device-active"
                          onClick={() => void toggle()}
                          className={`px-3 py-1.5 text-xs font-medium text-white rounded transition-colors ${
                            selected.active ? "bg-[#DC2626] hover:bg-[#B91C1C]" : "bg-[#0AB68B] hover:bg-[#089774]"
                          }`}
                        >
                          {selected.active ? "Deactivate" : "Activate"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Device Specifications & Metrics */}
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
                    <div key={label} className="bg-gray-50/50 p-3 rounded border border-gray-100">
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
                      <dd className="mt-1 font-semibold text-gray-900">{val}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center text-gray-500 text-sm">
                Select a device from the list to view details.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
