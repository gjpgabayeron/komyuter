import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    // Integration tests share one real Postgres database — files must not run
    // concurrently or they corrupt each other's counts/assertions.
    fileParallelism: false,
    // Snapshot the database before the run and restore it after (via the
    // teardown returned by globalSetup), so integration-test data never
    // persists (routes/fare configs/auth users).
    globalSetup: ["./tests/integration/global-setup.ts"],
  },
});
