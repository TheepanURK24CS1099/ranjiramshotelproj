import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Invalid date format (YYYY-MM-DD)");
const money = z.coerce.number().finite().refine((value) => Math.round(value * 100) === value * 100, "Amount must have at most two decimal places");

export const advanceTypeSchema = z.enum(["OPENING_ADVANCE", "ADVANCE_GIVEN", "REPAYMENT", "ADJUSTMENT"]);

export const createAdvanceSchema = z.object({
  transaction_type: advanceTypeSchema,
  amount: money,
  transaction_date: date,
  notes: z.string().max(2000).optional().nullable(),
}).superRefine((value, context) => {
  if (value.transaction_type === "ADJUSTMENT" ? value.amount === 0 : value.amount <= 0) {
    context.addIssue({ code: "custom", message: "Amount must be positive, except adjustments which may be signed" });
  }
});

export const updateAdvanceSchema = z.object({
  transaction_date: date.optional(),
  notes: z.string().max(2000).optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, "Only transaction date or notes may be corrected");
