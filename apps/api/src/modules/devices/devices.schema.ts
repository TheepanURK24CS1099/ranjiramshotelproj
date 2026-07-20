import { z } from "zod";

const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

export const createDeviceSchema = z.object({
  device_code: z.string().trim().min(1).max(100),
  name: optionalText(150),
  model: optionalText(100),
  serial_number: optionalText(150),
  firmware_version: optionalText(100),
  active: z.boolean().default(true),
}).strict();

export const updateDeviceSchema = createDeviceSchema.omit({ active: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const recentPunchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
