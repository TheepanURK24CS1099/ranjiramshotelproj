import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    username: z.string().trim().min(1, "Username is required").transform((username) => username.toLowerCase()),
    password: z.string().min(1, "Password is required"),
  }),
});

export type LoginInput = z.infer<typeof loginSchema>["body"];
