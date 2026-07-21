import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

export const createShiftSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  start_time: z.string().regex(timeRegex, "Invalid time format (HH:MM or HH:MM:SS)"),
  end_time: z.string().regex(timeRegex, "Invalid time format (HH:MM or HH:MM:SS)"),
  grace_minutes: z.number().int().min(0).default(0),
  minimum_work_minutes: z.number().int().min(0).default(0),
  early_exit_tolerance_minutes: z.number().int().min(0).default(0),
  checkin_before_minutes: z.number().int().min(0).default(0),
  checkout_after_minutes: z.number().int().min(0).default(360),
  weekly_off_days: z.array(z.number().int().min(0).max(6)).default([]),
  is_overnight: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const updateShiftSchema = createShiftSchema.partial();

export const updateShiftStatusSchema = z.object({
  active: z.boolean(),
});
