export function formatShiftTime(value: unknown): string {
  if (!value) return "—";
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  if (!match) return String(value);
  const hour = Number(match[1]);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatAttendanceStatus(status: string | null | undefined): string {
  if (!status) return "—";
  switch (status) {
    case "CURRENTLY_CHECKED_IN":
      return "Currently Checked In";
    case "CHECK_IN_MISSING":
    case "MISSING_IN":
      return "Check-in Missing";
    case "MISSING_OUT":
      return "Check-out Missing";
    case "NOT_STARTED":
      return "Not Started";
    case "COMPLETED":
      return "Completed";
    case "PRESENT":
      return "Present";
    case "LATE":
      return "Late";
    case "EARLY_EXIT":
      return "Early Exit";
    case "LATE_AND_EARLY_EXIT":
      return "Late & Early Exit";
    case "HALF_DAY":
      return "Half Day";
    case "ABSENT":
      return "Absent";
    case "MISSING_PUNCH":
      return "Missing Punch";
    case "PENDING":
      return "Pending";
    case "WEEKLY_OFF":
      return "Weekly Off";
    case "HOLIDAY":
      return "Holiday";
    case "NO_SHIFT":
      return "No Shift";
    case "UNMATCHED":
      return "Unmatched";
    case "EXCEPTION":
    case "OUT_OF_SHIFT":
      return "Exception";
    default:
      return status
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
  }
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
