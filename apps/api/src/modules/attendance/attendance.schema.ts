import { z } from "zod";

export const attendanceStatusSchema = z.enum(["PRESENT", "MISSING_PUNCH", "UNMATCHED", "NO_SHIFT"]);

export const attendanceQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  employeeId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  status: attendanceStatusSchema.optional(),
});
