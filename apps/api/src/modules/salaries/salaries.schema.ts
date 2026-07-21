import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Invalid date format (YYYY-MM-DD)");
const money = z.coerce.number().finite().refine((value) => Math.round(value * 100) === value * 100, "Amount must have at most two decimal places");

export const salaryTypeSchema = z.enum(["MONTHLY", "DAILY", "HOURLY"]);

export const createSalarySchema = z.object({
  salary_type: salaryTypeSchema,
  monthly_salary: money.positive().optional(),
  daily_rate: money.positive().optional(),
  hourly_rate: money.positive().optional(),
  effective_from: date,
  effective_to: date.optional().nullable(),
  active: z.boolean().default(true),
  notes: z.string().max(2000).optional().nullable(),
}).superRefine((value, context) => {
  const requiredAmount = value.salary_type === "MONTHLY" ? value.monthly_salary : value.salary_type === "DAILY" ? value.daily_rate : value.hourly_rate;
  if (requiredAmount === undefined) context.addIssue({ code: "custom", message: `${value.salary_type} salary amount is required` });
  if (value.effective_to && value.effective_to < value.effective_from) context.addIssue({ code: "custom", message: "Effective to cannot be before effective from" });
});

export const updateSalarySchema = z.object({
  effective_to: date.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, "No salary fields provided");

export const updateSalaryStatusSchema = z.object({ active: z.boolean() });
