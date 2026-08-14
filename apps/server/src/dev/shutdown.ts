import type { Server } from "node:http";

import type { Pool } from "pg";

const SHUTDOWN_TIMEOUT_MS = 10_000;

export function registerGracefulShutdown(options: {
  server: Server;
  pool: Pool;
  stopOutboxWorker: () => void;
}): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`[shutdown] received ${signal}`);

    options.stopOutboxWorker();

    const forceExitTimer = setTimeout(() => {
      console.error("[shutdown] timed out; forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceExitTimer.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        options.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await options.pool.end();
      console.log("[shutdown] complete");
      process.exit(0);
    } catch (error) {
      console.error("[shutdown] failed:", error);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}
