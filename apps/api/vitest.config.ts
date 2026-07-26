import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration files share the configured PostgreSQL database. Running them
    // sequentially in a single fork prevents cross-file database lock contention.
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
