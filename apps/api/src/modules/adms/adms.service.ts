import { createHash } from "node:crypto";
import * as devicesRepository from "../devices/devices.repository.js";
import { rebuildAttendanceForBiometricDate } from "../attendance/attendance.repository.js";
import { parseAttendancePayload } from "./adms.parser.js";
import { insertPunch } from "./adms.repository.js";
import { logger } from "../../config/logger.js";

const IST_OFFSET_MS = 330 * 60_000;

function toIstDateKey(value: Date): string {
  return new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export class AdmsDeviceError extends Error { constructor(public statusCode: number, message: string){super(message)} }

function eventKey(deviceId:string,biometricId:string,punchTime:Date,punchState:string|null,verifyMode:string|null):string{
  return createHash("sha256").update([deviceId,biometricId,punchTime.toISOString(),punchState??"",verifyMode??""].join("|")).digest("hex");
}
export async function receive(identity:string|undefined,body:string,ip:string|null){
  if(!identity?.trim()) throw new AdmsDeviceError(400,"Missing device identity");
  const device=await devicesRepository.findByIdentity(identity.trim());
  if(!device) { logger.warn({ ip }, "Rejected ADMS request from unknown device"); throw new AdmsDeviceError(404,"Unknown device"); }
  if(!device.active) { logger.warn({ deviceId: device.id, ip }, "Rejected ADMS request from inactive device"); throw new AdmsDeviceError(403,"Inactive device"); }
  await devicesRepository.markSeen(device.id,ip,true);
  const parsed=parseAttendancePayload(body);
  if(parsed.malformed) logger.warn({ deviceId: device.id, malformed: parsed.malformed }, "Ignored malformed ADMS attendance records");
  let inserted=0;
  for (const punch of parsed.punches) {
    const storedPunch = await insertPunch(device.id, device.device_code, punch, eventKey(device.id, punch.biometricId, punch.punchTime, punch.punchState, punch.verifyMode));
    if (storedPunch.inserted) inserted += 1;
    if (storedPunch.inserted) await devicesRepository.markRawPunchReceived(device.id, storedPunch.punch_time);

    const punchDate = toIstDateKey(storedPunch.punch_time);
    // A retry may arrive after an operator rebuild/delete; replaying the
    // deterministic attendance calculation is safe and restores that view.
    await rebuildAttendanceForBiometricDate(storedPunch.biometric_id, punchDate);
    await rebuildAttendanceForBiometricDate(storedPunch.biometric_id, addDays(punchDate, -1));
  }
  return {received:parsed.punches.length,inserted,malformed:parsed.malformed};
}
