"use client";

import { useEffect, useMemo, useState } from "react";

import { ConfirmationModal } from "@/components/confirmation-modal";
import { ApiError, apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

type Device = { id: string; device_code: string; name: string | null; model: string | null; serial_number: string | null; firmware_version: string | null; active: boolean; status: "ONLINE" | "OFFLINE"; last_seen: string | null; last_sync: string | null; last_ip: string | null; last_raw_punch_time: string | null; last_raw_punch_received: string | null };
type Punch = { id: string; biometric_id: string; punch_time: string; punch_state: string | null; verify_mode: string | null; received_at: string; ignored?: boolean };
type PunchAction = "ignore" | "reprocess" | "delete" | "clear-today" | "clear-date";

const empty = { device_code: "", name: "", model: "MB160", serial_number: "", firmware_version: "" };
const istToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const istDate = (value: string) => new Date(new Date(value).getTime() + 330 * 60_000).toISOString().slice(0, 10);

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<Device | null>(null);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [role, setRole] = useState("MANAGER");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [punchDate, setPunchDate] = useState("");
  const [selectedPunches, setSelectedPunches] = useState<string[]>([]);
  const [punchAction, setPunchAction] = useState<PunchAction | null>(null);
  const [working, setWorking] = useState(false);

  const load = async (deviceId = selected?.id) => {
    try {
      const [list, user] = await Promise.all([apiClient.get("/devices"), apiClient.get("/auth/me")]);
      const rows = list as Device[];
      const next = deviceId ? rows.find((device) => device.id === deviceId) ?? rows[0] : rows[0];
      setDevices(rows);
      setRole(String((user as { role: string }).role));
      setSelected(next ?? null);
      setPunches(next ? await apiClient.get(`/devices/${next.id}/recent-punches`) as Punch[] : []);
      setSelectedPunches([]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to load biometric devices");
    }
  };

  useEffect(() => {
    Promise.all([apiClient.get("/devices"), apiClient.get("/auth/me")])
      .then(async ([list, user]) => {
        const rows = list as Device[];
        const first = rows[0] ?? null;
        setDevices(rows);
        setRole(String((user as { role: string }).role));
        setSelected(first);
        setPunches(first ? await apiClient.get(`/devices/${first.id}/recent-punches`) as Punch[] : []);
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : "Failed to load biometric devices"));
  }, []);

  const choose = async (device: Device) => {
    setError("");
    setSelected(device);
    setSelectedPunches([]);
    try {
      setPunches(await apiClient.get(`/devices/${device.id}/recent-punches`) as Punch[]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to load raw punches");
    }
  };

  const visiblePunches = useMemo(() => punchDate ? punches.filter((punch) => istDate(punch.punch_time) === punchDate) : punches, [punches, punchDate]);
  const allPunchesSelected = visiblePunches.length > 0 && visiblePunches.every((punch) => selectedPunches.includes(punch.id));
  const togglePunch = (id: string) => setSelectedPunches((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]));
      if (editing && selected) await apiClient.patch(`/devices/${selected.id}`, payload); else await apiClient.post("/devices", payload);
      setEditing(false); setForm(empty); await load(selected?.id);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Unable to save device"); }
  };
  const edit = () => { if (selected) { setEditing(true); setForm({ device_code: selected.device_code, name: selected.name ?? "", model: selected.model ?? "", serial_number: selected.serial_number ?? "", firmware_version: selected.firmware_version ?? "" }); } };
  const toggle = async () => { if (!selected) return; try { await apiClient.patch(`/devices/${selected.id}/${selected.active ? "deactivate" : "activate"}`, {}); await load(selected.id); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Unable to update device"); } };

  const runPunchAction = async () => {
    if (!punchAction) return;
    setWorking(true); setError("");
    try {
      const ids = selectedPunches.map(Number);
      let summary: string;
      if (punchAction === "ignore") {
        const result = await apiClient.patch("/devices/punches/ignore", { ids, ignored: true }) as { updated?: number };
        summary = `${result.updated ?? 0} of ${ids.length} selected punch${ids.length === 1 ? "" : "es"} marked ignored.`;
      } else if (punchAction === "reprocess") {
        const result = await apiClient.post("/devices/punches/reprocess", { ids }) as { processed?: number; skipped?: number; blocked?: number; failed?: number };
        summary = `Processed ${result.processed ?? 0}; skipped ${result.skipped ?? 0}; blocked ${result.blocked ?? result.failed ?? 0}.`;
      } else if (punchAction === "delete") {
        const result = await apiClient.delete("/devices/punches", { body: JSON.stringify({ ids }), headers: { "Content-Type": "application/json" } }) as { deleted?: number; skipped?: number; blocked?: number };
        summary = `Deleted ${result.deleted ?? 0}; skipped ${result.skipped ?? 0}; blocked ${result.blocked ?? 0}.`;
      } else {
        const targetDate = punchAction === "clear-today" ? istToday : punchDate;
        const result = await apiClient.post("/devices/punches/clear-date", { date: targetDate }) as { deleted?: number; skipped?: number; blocked?: number };
        summary = `Deleted ${result.deleted ?? 0}; skipped ${result.skipped ?? 0}; blocked ${result.blocked ?? 0} test punch${(result.deleted ?? 0) === 1 ? "" : "es"}.`;
      }
      setMessage(summary);
      await load(selected?.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to update raw punches");
    } finally { setWorking(false); setPunchAction(null); }
  };

  const actionTitle = punchAction === "ignore" ? "Mark selected punches ignored?" : punchAction === "reprocess" ? "Reprocess selected punches?" : punchAction === "delete" ? "Permanently delete selected punches?" : punchAction === "clear-today" ? "Clear today's test punches?" : "Clear test punches for the selected date?";
  const actionMessage = punchAction === "ignore" ? "Ignored punches are preserved and excluded from attendance processing. Prefer this to deletion." : punchAction === "reprocess" ? "Attendance will be rebuilt for eligible punch dates." : punchAction === "delete" ? "This is permanent and cannot be undone. Use Ignore when you only need to exclude a punch from processing." : "Only test punches for this date will be permanently deleted. This cannot be undone.";

  return <div className="space-y-6"><div className="flex justify-between items-center"><div><h1 className="text-2xl font-semibold">Biometric Device</h1><p className="text-sm text-gray-500">Registered biometric machines and unprocessed device activity</p></div>{role === "ADMIN" && <button onClick={() => { setEditing(true); setSelected(null); setForm(empty); }} className="px-4 py-2 bg-[#028174] text-white rounded">Add Device</button>}</div>
    {error && <div className="p-3 bg-red-100 text-[#DC2626] rounded" role="alert">{error}</div>}{message && <div className="p-3 bg-green-50 text-green-800 rounded" role="status">{message}</div>}
    {editing && role === "ADMIN" && <form onSubmit={save} className="bg-white p-5 rounded shadow grid grid-cols-1 md:grid-cols-2 gap-4">{Object.keys(empty).map((key) => <label key={key} className="text-sm capitalize">{key.replaceAll("_", " ")}{key === "device_code" && " *"}<input required={key === "device_code"} value={form[key as keyof typeof form]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="block mt-1 w-full border rounded px-3 py-2" /></label>)}<div className="md:col-span-2 flex justify-end gap-3"><button type="button" onClick={() => setEditing(false)} className="px-4 py-2 border rounded">Cancel</button><button className="px-4 py-2 bg-[#028174] text-white rounded">Save Device</button></div></form>}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="bg-white rounded shadow divide-y">{devices.map((device) => <button key={device.id} onClick={() => void choose(device)} className={`w-full text-left p-4 ${selected?.id === device.id ? "bg-emerald-50" : ""}`}><div className="font-semibold">{device.name || device.device_code}</div><div className="text-sm text-gray-500">{device.model || "Model not set"} · {device.device_code}</div></button>)}{!devices.length && <div className="p-6 text-gray-500">No devices configured.</div>}</div>
      <div className="lg:col-span-2 space-y-6">{selected && <div className="bg-white p-6 rounded shadow"><div className="flex justify-between"><div><h2 className="text-xl font-semibold">{selected.name || selected.device_code}</h2><span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold text-white ${selected.status === "ONLINE" ? "bg-[#0AB68B]" : "bg-[#DC2626]"}`}>{selected.status}</span></div><div className="space-x-2"><button onClick={() => void load(selected.id)} className="px-3 py-2 border rounded">Refresh Status</button>{role === "ADMIN" && <><button onClick={edit} className="px-3 py-2 border rounded">Edit</button><button onClick={() => void toggle()} className={`px-3 py-2 text-white rounded ${selected.active ? "bg-[#DC2626]" : "bg-[#0AB68B]"}`}>{selected.active ? "Deactivate" : "Activate"}</button></>}</div></div><dl className="grid grid-cols-2 gap-4 mt-5 text-sm">{[["Device code", selected.device_code], ["Serial number", selected.serial_number || "—"], ["Firmware", selected.firmware_version || "—"], ["Last IP", selected.last_ip || "—"], ["Last seen", formatDateTime(selected.last_seen)], ["Last sync", formatDateTime(selected.last_sync)], ["Last raw punch", formatDateTime(selected.last_raw_punch_time ?? selected.last_raw_punch_received)], ["Configuration", selected.active ? "Active" : "Inactive"]].map(([label, value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl></div>}
        <div className="bg-white rounded shadow overflow-hidden"><div className="p-5 border-b flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Recent Raw Device Punches</h2><p className="text-sm text-gray-500">{visiblePunches.length} visible punch{visiblePunches.length === 1 ? "" : "es"}</p></div><label className="text-sm text-gray-600">Punch date <input type="date" value={punchDate} onChange={(event) => { setPunchDate(event.target.value); setSelectedPunches([]); }} className="ml-2 border rounded px-2 py-1" /></label></div>
          {role === "ADMIN" && <div className="px-5 py-2 border-b flex flex-wrap items-center gap-2 text-xs"><span className="mr-1">{selectedPunches.length} selected</span><button disabled={!selectedPunches.length || working} onClick={() => setPunchAction("ignore")} className="border rounded px-2 py-1 disabled:opacity-50">Mark Ignored</button><button disabled={!selectedPunches.length || working} onClick={() => setPunchAction("reprocess")} className="border rounded px-2 py-1 disabled:opacity-50">Reprocess Selected</button><button disabled={!selectedPunches.length || working} onClick={() => setPunchAction("delete")} className="border rounded px-2 py-1 text-red-700 disabled:opacity-50">Delete Selected</button><button disabled={working} onClick={() => setPunchAction("clear-today")} className="border rounded px-2 py-1 disabled:opacity-50">Clear Today’s Test Punches</button><button disabled={!punchDate || working} onClick={() => setPunchAction("clear-date")} className="border rounded px-2 py-1 disabled:opacity-50">Clear Selected Date</button><button disabled={!selectedPunches.length || working} onClick={() => setSelectedPunches([])} className="border rounded px-2 py-1 disabled:opacity-50">Clear Selection</button></div>}
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr>{role === "ADMIN" && <th className="p-3"><input aria-label="Select all visible raw punches" type="checkbox" checked={allPunchesSelected} onChange={() => setSelectedPunches(allPunchesSelected ? [] : visiblePunches.map((punch) => punch.id))} /></th>}<th className="p-3">Biometric ID</th><th className="p-3">Punch time</th><th className="p-3">State</th><th className="p-3">Verify mode</th><th className="p-3">Received</th></tr></thead><tbody>{visiblePunches.map((punch) => <tr key={punch.id} className="border-t">{role === "ADMIN" && <td className="p-3"><input aria-label={`Select raw punch ${punch.id}`} type="checkbox" checked={selectedPunches.includes(punch.id)} onChange={() => togglePunch(punch.id)} /></td>}<td className="p-3 font-medium">{punch.biometric_id}</td><td className="p-3">{formatDateTime(punch.punch_time)}</td><td className="p-3">{punch.punch_state ?? "—"}</td><td className="p-3">{punch.verify_mode ?? "—"}</td><td className="p-3">{formatDateTime(punch.received_at)}</td></tr>)}{!visiblePunches.length && <tr><td colSpan={role === "ADMIN" ? 6 : 5} className="p-5 text-center text-gray-500">No raw punches received.</td></tr>}</tbody></table></div></div></div></div>
    <ConfirmationModal open={punchAction !== null} pending={working} recordName="raw punches" title={actionTitle} message={actionMessage} confirmLabel={punchAction === "ignore" ? "Mark Ignored" : punchAction === "reprocess" ? "Reprocess" : punchAction === "delete" ? "Delete Permanently" : punchAction === "clear-today" ? "Clear Today" : "Clear Selected Date"} onCancel={() => setPunchAction(null)} onConfirm={() => void runPunchAction()} />
  </div>;
}
