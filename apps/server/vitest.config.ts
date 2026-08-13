import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config();

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL (or TEST_DATABASE_URL) must be set to run tests",
  );
}

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 15_000,
    env: {
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
    },
  },
});
