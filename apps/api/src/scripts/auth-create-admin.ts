import "dotenv/config";
import { pathToFileURL } from "node:url";

import argon2 from "argon2";
import { z } from "zod";

import { checkDatabaseConnection, closeDatabasePool } from "../infrastructure/database/database.js";
import { authRepository } from "../modules/auth/auth.repository.js";

const adminArgumentsSchema = z.object({
  username: z.string().trim().min(1).regex(/^[a-zA-Z0-9._-]+$/u).transform((username) => username.toLowerCase()),
  password: z.string().min(12, "Password must be at least 12 characters long"),
});

function parseArguments(args: string[]): { username?: string; password?: string } | null {
  const values: { username?: string; password?: string } = {};

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if ((flag !== "--username" && flag !== "--password") || !value || value.startsWith("--")) {
      return null;
    }
    const key = flag.slice(2) as "username" | "password";
    if (values[key] !== undefined) {
      return null;
    }
    values[key] = value;
  }

  return values;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  try {
    const parsedArguments = adminArgumentsSchema.safeParse(parseArguments(args));
    if (!parsedArguments.success) {
      console.error("Usage: auth:create-admin --username <username> --password <secure password of at least 12 characters>");
      process.exitCode = 1;
      return;
    }

    const { username, password } = parsedArguments.data;
    await checkDatabaseConnection();

    const passwordHash = await argon2.hash(password);
    await authRepository.createOrResetAdmin(username, passwordHash);

    console.log(`Admin user '${username}' was created or reset successfully.`);
    process.exitCode = 0;
  } catch {
    console.error("An error occurred while creating or resetting the admin user.");
    process.exitCode = 1;
  } finally {
    await closeDatabasePool();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
