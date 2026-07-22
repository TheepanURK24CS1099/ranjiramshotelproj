import { env } from "../../config/environment.js";

export interface ParsedPunch { biometricId: string; punchTime: Date; deviceTimestamp: string; punchState: string | null; verifyMode: string | null; workCode: string | null; rawPayload: string; rawRecord: string; }

function parseMachineTime(value: string): Date | null {
  const normalized = value.trim().replace(" ", "T");
  const local = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/u);
  if (local) {
    const [year, month, day, hour, minute, second] = local.slice(1).map(Number);
    const utc = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second!));
    if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month! - 1 || utc.getUTCDate() !== day || utc.getUTCHours() !== hour || utc.getUTCMinutes() !== minute || utc.getUTCSeconds() !== second) return null;
    return new Date(`${normalized}${env.ADMS_TIMEZONE_OFFSET}`);
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function unwrapBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed.includes("=")) return trimmed;
  const params = new URLSearchParams(trimmed);
  return params.get("ATTLOG") ?? params.get("attlog") ?? params.get("data") ?? trimmed;
}

export function parseAttendancePayload(body: string): { punches: ParsedPunch[]; malformed: number } {
  const lines = unwrapBody(body).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const punches: ParsedPunch[] = [];
  let malformed = 0;
  for (const originalLine of lines) {
    const line = originalLine.replace(/^ATTLOG[=:]\s*/i, "");
    const fields = line.includes("\t") ? line.split("\t") : line.split(/\s*,\s*/);
    const biometricId = fields[0]?.trim();
    const punchTime = fields[1] ? parseMachineTime(fields[1]) : null;
    if (!biometricId || !/^\d+$/.test(biometricId) || !punchTime) { malformed += 1; continue; }
    punches.push({ biometricId, punchTime, deviceTimestamp: fields[1]!.trim(), punchState: fields[2]?.trim() || null, verifyMode: fields[3]?.trim() || null, workCode: fields[4]?.trim() || null, rawPayload: body, rawRecord: originalLine });
  }
  return { punches, malformed };
}
