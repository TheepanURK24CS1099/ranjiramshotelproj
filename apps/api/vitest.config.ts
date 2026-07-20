import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration files share the configured PostgreSQL database. Running them
    // concurrently allows one file's cleanup to invalidate another's fixtures.
    fileParallelism: false,
  },
});
