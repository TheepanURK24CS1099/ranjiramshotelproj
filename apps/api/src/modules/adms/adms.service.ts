import { createHash } from "node:crypto";
import * as devicesRepository from "../devices/devices.repository.js";
import { rebuildAttendanceForBiometricDate } from "../attendance/attendance.repository.js";
import { parseAttendancePayload } from "./adms.parser.js";
import { insertPunch } from "./adms.repository.js";

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
  if(!device) throw new AdmsDeviceError(404,"Unknown device");
  if(!device.active) throw new AdmsDeviceError(403,"Inactive device");
  await devicesRepository.markSeen(device.id,ip);
  const parsed=parseAttendancePayload(body);
  let inserted=0;
  for (const punch of parsed.punches) {
    const storedPunch = await insertPunch(device.id, punch, eventKey(device.id, punch.biometricId, punch.punchTime, punch.punchState, punch.verifyMode));
    if (storedPunch.inserted) inserted += 1;

    const punchDate = toIstDateKey(storedPunch.punch_time);
    await rebuildAttendanceForBiometricDate(storedPunch.biometric_id, punchDate);
    await rebuildAttendanceForBiometricDate(storedPunch.biometric_id, addDays(punchDate, -1));
  }
  return {received:parsed.punches.length,inserted,malformed:parsed.malformed};
}
