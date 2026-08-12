import { publishPendingEvents } from "./outbox-publisher.js";

const POLL_INTERVAL_MS = 1_000;

let running = false;

export function startOutboxWorker(): () => void {
  const interval = setInterval(async () => {
    if (running) {
      return;
    }

    running = true;

    try {
      await publishPendingEvents();
    } catch (error) {
      console.error("[outbox] worker error:", error);
    } finally {
      running = false;
    }
  }, POLL_INTERVAL_MS);

  console.log(
    `[outbox] worker started; polling every ${POLL_INTERVAL_MS}ms`,
  );

  return () => {
    clearInterval(interval);
    console.log("[outbox] worker stopped");
  };
}