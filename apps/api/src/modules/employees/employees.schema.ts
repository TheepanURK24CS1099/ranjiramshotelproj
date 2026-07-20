import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createEmployeeSchema = z.object({
  biometric_id: z.number().int().positive(),
  name: z.string().min(1, "Name is required").max(255),
  phone: z.string().max(50).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  designation: z.string().max(100).optional().nullable(),
  joining_date: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  weekly_off_day: z.number().int().min(0).max(6).optional().nullable(),
  active: z.boolean().default(true),
  // Optional shift assignment during creation
  initial_shift: z.object({
    shift_id: z.string().uuid(),
    effective_from: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  }).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.omit({ initial_shift: true }).partial();

export const updateEmployeeStatusSchema = z.object({
  active: z.boolean(),
});

export const assignShiftSchema = z.object({
  shift_id: z.string().uuid(),
  effective_from: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
});
