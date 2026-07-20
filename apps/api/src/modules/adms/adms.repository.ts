import { getDatabasePool } from "../../infrastructure/database/database.js";
import type { ParsedPunch } from "./adms.parser.js";
const pool=getDatabasePool();
export async function insertPunch(deviceId:string,punch:ParsedPunch,key:string):Promise<boolean>{
  const result=await pool.query(`INSERT INTO raw_attendance_punches(device_id,biometric_id,punch_time,punch_state,verify_mode,raw_payload,source_event_key) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(source_event_key) DO NOTHING RETURNING id`,[deviceId,punch.biometricId,punch.punchTime,punch.punchState,punch.verifyMode,JSON.stringify({payload:punch.rawPayload,record:punch.rawRecord}),key]);
  return result.rowCount===1;
}
