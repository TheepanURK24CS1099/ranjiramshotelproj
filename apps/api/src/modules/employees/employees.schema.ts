import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const money = z.coerce.number().finite().refine((value) => Math.round(value * 100) === value * 100, "Amount must have at most two decimal places");

const initialSalarySchema = z.object({
  salary_type: z.enum(["MONTHLY", "DAILY", "HOURLY"]).default("MONTHLY"),
  monthly_salary: money.positive().optional(),
  daily_rate: money.positive().optional(),
  hourly_rate: money.positive().optional(),
  effective_from: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  notes: z.string().max(2000).optional().nullable(),
}).superRefine((value, context) => {
  const amount = value.salary_type === "MONTHLY" ? value.monthly_salary : value.salary_type === "DAILY" ? value.daily_rate : value.hourly_rate;
  if (amount === undefined) context.addIssue({ code: "custom", message: `${value.salary_type} salary amount is required` });
});

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
  initial_salary: initialSalarySchema.optional(),
  opening_advance: z.object({
    amount: money.positive(),
    transaction_date: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
    notes: z.string().max(2000).optional().nullable(),
  }).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.omit({ initial_shift: true, initial_salary: true, opening_advance: true }).partial();

export const updateEmployeeStatusSchema = z.object({
  active: z.boolean(),
});

export const assignShiftSchema = z.object({
  shift_id: z.string().uuid(),
  effective_from: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
});
