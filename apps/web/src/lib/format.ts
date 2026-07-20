export function formatShiftTime(value: unknown): string {
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  if (!match) return String(value);
  const hour = Number(match[1]);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short", hour12: true }).format(new Date(value));
}

export function formatAttendanceDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }).format(new Date(value));
}

export function formatTimeOnly(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "short", hour12: true }).format(new Date(value));
}

export function formatWorkingMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}
