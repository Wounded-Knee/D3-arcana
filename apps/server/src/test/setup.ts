import "dotenv/config";

import { afterEach, beforeEach, vi } from "vitest";

import { truncateAll } from "./helpers/db.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for integration tests");
}

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  delete process.env.DEV_AUTH_TOKENS;
  vi.restoreAllMocks();
});
