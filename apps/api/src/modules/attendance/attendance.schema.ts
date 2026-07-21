import { z } from "zod";

export const attendanceStatusSchema = z.enum(["PRESENT", "LATE", "EARLY_EXIT", "LATE_AND_EARLY_EXIT", "HALF_DAY", "ABSENT", "MISSING_PUNCH", "WEEKLY_OFF", "HOLIDAY", "NO_SHIFT", "UNMATCHED"]);

export const attendanceQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  employeeId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  status: attendanceStatusSchema.optional(),
});
export const attendanceRebuildSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) });
