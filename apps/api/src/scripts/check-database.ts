import { pathToFileURL } from "node:url";

import { closeDatabasePool, checkDatabaseConnection } from "../infrastructure/database/database.js";

export async function main(): Promise<void> {
  try {
    await checkDatabaseConnection();
    console.log("Database connection check succeeded");
    process.exitCode = 0;
  } catch {
    console.error("Database connection check failed");
    process.exitCode = 1;
  } finally {
    await closeDatabasePool();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
