import "dotenv/config";

import { afterEach, beforeEach, vi } from "vitest";

import { truncateAll } from "./helpers/db.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for integration tests");
}

process.env.EGRESS_INGEST_SECRET ??= "test-egress-secret";
process.env.EGRESS_INGEST_URL ??= "ws://127.0.0.1:3000/internal/egress";

beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  delete process.env.DEV_AUTH_TOKENS;
  vi.restoreAllMocks();
  const { resetRecordingRetriesForTests } = await import(
    "../calls/recording-lifecycle.js"
  );
  const { resetEmptyRoomGraceForTests } = await import(
    "../calls/call-grace-timer.js"
  );
  const { resetSilenceWatchesForTests } = await import(
    "../calls/pcm-silence.js"
  );
  resetRecordingRetriesForTests();
  resetEmptyRoomGraceForTests();
  resetSilenceWatchesForTests();
});
