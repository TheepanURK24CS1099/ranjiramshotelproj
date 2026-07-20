import { env } from "../../config/environment.js";

export interface ParsedPunch { biometricId: string; punchTime: Date; punchState: string | null; verifyMode: string | null; rawPayload: string; rawRecord: string; }

function parseMachineTime(value: string): Date | null {
  const normalized = value.trim().replace(" ", "T");
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized) ? `${normalized}${env.ADMS_TIMEZONE_OFFSET}` : normalized;
  const date = new Date(withZone);
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
    punches.push({ biometricId, punchTime, punchState: fields[2]?.trim() || null, verifyMode: fields[3]?.trim() || null, rawPayload: body, rawRecord: originalLine });
  }
  return { punches, malformed };
}
