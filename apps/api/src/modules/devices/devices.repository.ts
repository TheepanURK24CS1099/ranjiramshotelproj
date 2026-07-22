import { getDatabasePool } from "../../infrastructure/database/database.js";

const pool = getDatabasePool();

export interface Device {
  id: string; device_code: string; name: string | null; model: string | null;
  serial_number: string | null; firmware_version: string | null; active: boolean;
  last_seen: Date | null; last_ip: string | null; status: "ONLINE" | "OFFLINE";
  last_sync?: Date | null; last_raw_punch_time?: Date | null;
  created_at: Date; updated_at: Date; last_raw_punch_received?: Date | null;
}

export interface RawPunch {
  id: string; device_id: string; biometric_id: string; punch_time: Date;
  punch_state: string | null; verify_mode: string | null; raw_payload: unknown;
  received_at: Date; source_event_key: string;
}

const selectDevice = `SELECT d.*, (SELECT max(r.received_at) FROM raw_attendance_punches r WHERE r.device_id = d.id) AS last_raw_punch_received FROM devices d`;

export async function list(): Promise<Device[]> {
  return (await pool.query(`${selectDevice} ORDER BY d.name NULLS LAST, d.device_code`)).rows;
}
export async function findById(id: string): Promise<Device | null> {
  return (await pool.query(`${selectDevice} WHERE d.id = $1`, [id])).rows[0] ?? null;
}
export async function findByIdentity(identity: string): Promise<Device | null> {
  return (await pool.query(`${selectDevice} WHERE lower(d.device_code) = lower($1) OR lower(d.serial_number) = lower($1) LIMIT 1`, [identity])).rows[0] ?? null;
}
export async function findConflict(deviceCode?: string, serialNumber?: string | null, excludeId?: string): Promise<Device | null> {
  const result = await pool.query(`${selectDevice} WHERE ($1::text IS NOT NULL AND lower(d.device_code)=lower($1)) OR ($2::text IS NOT NULL AND lower(d.serial_number)=lower($2))`, [deviceCode ?? null, serialNumber ?? null]);
  return result.rows.find((row: Device) => row.id !== excludeId) ?? null;
}
export async function create(data: Omit<Device, "id" | "last_seen" | "last_ip" | "status" | "created_at" | "updated_at">): Promise<Device> {
  return (await pool.query(`INSERT INTO devices (device_code,name,model,serial_number,firmware_version,active,status) VALUES ($1,$2,$3,$4,$5,$6,'OFFLINE') RETURNING *`, [data.device_code,data.name,data.model,data.serial_number,data.firmware_version,data.active])).rows[0];
}
export async function update(id: string, data: { device_code?: string | undefined; name?: string | null | undefined; model?: string | null | undefined; serial_number?: string | null | undefined; firmware_version?: string | null | undefined }): Promise<Device | null> {
  const allowed = ["device_code","name","model","serial_number","firmware_version"] as const;
  const entries = allowed.filter((key) => data[key] !== undefined).map((key) => [key, data[key]] as const);
  if (!entries.length) return findById(id);
  const values = entries.map((entry) => entry[1]);
  const sets = entries.map((entry, index) => `${entry[0]}=$${index + 2}`);
  return (await pool.query(`UPDATE devices SET ${sets.join(",")} WHERE id=$1 RETURNING *`, [id, ...values])).rows[0] ?? null;
}
export async function setActive(id: string, active: boolean): Promise<Device | null> {
  return (await pool.query("UPDATE devices SET active=$2,status='OFFLINE' WHERE id=$1 RETURNING *", [id, active])).rows[0] ?? null;
}
export async function markSeen(id: string, ip: string | null, synced = false): Promise<void> {
  await pool.query("UPDATE devices SET last_seen=now(),last_ip=$2,status='ONLINE',last_sync=CASE WHEN $3 THEN now() ELSE last_sync END WHERE id=$1 AND active=true", [id, ip, synced]);
}
export async function markRawPunchReceived(id: string, punchTime: Date): Promise<void> {
  await pool.query("UPDATE devices SET last_raw_punch_time=GREATEST(COALESCE(last_raw_punch_time, $2), $2) WHERE id=$1", [id, punchTime]);
}
export async function markStaleOffline(thresholdMs: number): Promise<number> {
  const result = await pool.query("UPDATE devices SET status='OFFLINE' WHERE status <> 'OFFLINE' AND (active=false OR last_seen IS NULL OR last_seen < now() - ($1 * interval '1 millisecond'))", [thresholdMs]);
  return result.rowCount ?? 0;
}
export async function recentPunches(deviceId: string, limit: number): Promise<RawPunch[]> {
  return (await pool.query("SELECT * FROM raw_attendance_punches WHERE device_id=$1 ORDER BY received_at DESC,id DESC LIMIT $2", [deviceId, limit])).rows;
}
