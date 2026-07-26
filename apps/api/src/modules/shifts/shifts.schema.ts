import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

export const sessionInputSchema = z.object({
  id: z.string().uuid().optional(),
  session_number: z.number().int().min(1).max(3),
  start_time: z.string().regex(timeRegex, "Invalid time format (HH:MM or HH:MM:SS)"),
  end_time: z.string().regex(timeRegex, "Invalid time format (HH:MM or HH:MM:SS)"),
  grace_minutes: z.number().int().min(0).default(0),
  minimum_work_minutes: z.number().int().min(0).default(0),
  early_exit_tolerance_minutes: z.number().int().min(0).default(0),
  checkin_before_minutes: z.number().int().min(0).default(0),
  checkout_after_minutes: z.number().int().min(0).default(60),
  crosses_midnight: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const createShiftSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  start_time: z.string().regex(timeRegex, "Invalid time format (HH:MM or HH:MM:SS)").optional(),
  end_time: z.string().regex(timeRegex, "Invalid time format (HH:MM or HH:MM:SS)").optional(),
  grace_minutes: z.number().int().min(0).default(0),
  minimum_work_minutes: z.number().int().min(0).default(0),
  early_exit_tolerance_minutes: z.number().int().min(0).default(0),
  checkin_before_minutes: z.number().int().min(0).default(0),
  checkout_after_minutes: z.number().int().min(0).default(60),
  weekly_off_days: z.array(z.number().int().min(0).max(6)).default([]),
  is_overnight: z.boolean().default(false),
  active: z.boolean().default(true),
  sessions: z.array(sessionInputSchema).min(1).max(3).optional(),
});

export const updateShiftSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  start_time: z.string().regex(timeRegex).optional(),
  end_time: z.string().regex(timeRegex).optional(),
  grace_minutes: z.number().int().min(0).optional(),
  minimum_work_minutes: z.number().int().min(0).optional(),
  early_exit_tolerance_minutes: z.number().int().min(0).optional(),
  checkin_before_minutes: z.number().int().min(0).optional(),
  checkout_after_minutes: z.number().int().min(0).optional(),
  weekly_off_days: z.array(z.number().int().min(0).max(6)).optional(),
  is_overnight: z.boolean().optional(),
  active: z.boolean().optional(),
  sessions: z.array(sessionInputSchema).min(1).max(3).optional(),
});

export const updateShiftStatusSchema = z.object({
  active: z.boolean(),
});
