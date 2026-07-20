export function formatShiftTime(value: unknown): string {
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  if (!match) return String(value);
  const hour = Number(match[1]);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
