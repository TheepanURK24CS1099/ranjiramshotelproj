import "dotenv/config";
import argon2 from "argon2";
import { z } from "zod";

import { checkDatabaseConnection, closeDatabasePool } from "../infrastructure/database/database.js";
import { authRepository } from "../modules/auth/auth.repository.js";

const envSchema = z.object({
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12, "Password must be at least 12 characters long"),
});

async function main() {
  try {
    const parsedEnv = envSchema.safeParse(process.env);

    if (!parsedEnv.success) {
      console.error("Invalid or missing ADMIN_EMAIL or ADMIN_PASSWORD environment variables.");
      process.exit(1);
    }

    const { ADMIN_EMAIL, ADMIN_PASSWORD } = parsedEnv.data;

    await checkDatabaseConnection();

    const existingUser = await authRepository.getUserByEmail(ADMIN_EMAIL);
    if (existingUser) {
      console.log(`Admin user with email ${ADMIN_EMAIL} already exists. Skipping creation.`);
      return;
    }

    const passwordHash = await argon2.hash(ADMIN_PASSWORD);
    
    const newUser = await authRepository.createAdmin(ADMIN_EMAIL, passwordHash);
    
    if (newUser) {
      console.log(`Successfully created admin user: ${ADMIN_EMAIL}`);
    } else {
      console.log(`User ${ADMIN_EMAIL} already exists or could not be created.`);
    }

  } catch (error) {
    console.error("An error occurred while creating the admin user:", error instanceof Error ? error.message : "unknown error");
    process.exit(1);
  } finally {
    await closeDatabasePool();
  }
}

main();
