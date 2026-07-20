import { env } from "../../config/environment.js";
import * as devicesRepository from "./devices.repository.js";

export type DeviceStatus = "ONLINE" | "OFFLINE";

export function calculateDeviceStatus(active: boolean, lastSeen: Date | string | null, now = new Date()): DeviceStatus {
  if (!active || !lastSeen) return "OFFLINE";
  return now.getTime() - new Date(lastSeen).getTime() <= env.DEVICE_OFFLINE_THRESHOLD_MS ? "ONLINE" : "OFFLINE";
}

export async function markStaleDevicesOffline(): Promise<number> {
  return devicesRepository.markStaleOffline(env.DEVICE_OFFLINE_THRESHOLD_MS);
}

let timer: NodeJS.Timeout | undefined;

export function startDeviceStatusMonitor(): void {
  if (timer) return;
  timer = setInterval(() => void markStaleDevicesOffline(), env.DEVICE_STATUS_CHECK_INTERVAL_MS);
  timer.unref();
}

export function stopDeviceStatusMonitor(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
