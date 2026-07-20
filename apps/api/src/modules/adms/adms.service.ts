import { createHash } from "node:crypto";
import * as devicesRepository from "../devices/devices.repository.js";
import { parseAttendancePayload } from "./adms.parser.js";
import { insertPunch } from "./adms.repository.js";

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
  for(const punch of parsed.punches){if(await insertPunch(device.id,punch,eventKey(device.id,punch.biometricId,punch.punchTime,punch.punchState,punch.verifyMode)))inserted+=1}
  return {received:parsed.punches.length,inserted,malformed:parsed.malformed};
}
