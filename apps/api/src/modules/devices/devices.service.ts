import * as repository from "./devices.repository.js";
import { calculateDeviceStatus } from "./device-status.service.js";
import type { z } from "zod";
import type { createDeviceSchema, updateDeviceSchema } from "./devices.schema.js";

type CreateInput = z.infer<typeof createDeviceSchema>;
type UpdateInput = z.infer<typeof updateDeviceSchema>;

function withStatus(device: repository.Device): repository.Device {
  return { ...device, status: calculateDeviceStatus(device.active, device.last_seen) };
}
export async function list() { return (await repository.list()).map(withStatus); }
export async function get(id: string) { const value = await repository.findById(id); return value ? withStatus(value) : null; }
export async function create(data: CreateInput) {
  if (await repository.findConflict(data.device_code, data.serial_number)) throw new Error("Conflict: Device code or serial number already exists");
  return withStatus(await repository.create({ ...data, name: data.name ?? null, model: data.model ?? null, serial_number: data.serial_number ?? null, firmware_version: data.firmware_version ?? null }));
}
export async function update(id: string, data: UpdateInput) {
  if (await repository.findConflict(data.device_code, data.serial_number, id)) throw new Error("Conflict: Device code or serial number already exists");
  const value = await repository.update(id, data); return value ? withStatus(value) : null;
}
export async function setActive(id: string, active: boolean) { const value = await repository.setActive(id, active); return value ? withStatus(value) : null; }
export async function recentPunches(id: string, limit: number) { if (!await repository.findById(id)) return null; return repository.recentPunches(id, limit); }
