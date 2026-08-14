import type { Server } from "node:http";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerGracefulShutdown } from "./shutdown.js";

describe("registerGracefulShutdown", () => {
  afterEach(() => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
  });

  it("stops the outbox worker, closes the server, and ends the pool on SIGTERM", async () => {
    const stopOutboxWorker = vi.fn();
    const poolEnd = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn((_code: number) => undefined as never);

    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        callback();
      }),
    } as unknown as Server;

    const pool = {
      end: poolEnd,
    } as unknown as Pool;

    registerGracefulShutdown({
      server,
      pool,
      stopOutboxWorker,
      exit,
    });

    process.emit("SIGTERM");

    await vi.waitFor(() => {
      expect(stopOutboxWorker).toHaveBeenCalledOnce();
      expect(server.close).toHaveBeenCalledOnce();
      expect(poolEnd).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledWith(0);
    });
  });

  it("ignores duplicate shutdown signals", async () => {
    const stopOutboxWorker = vi.fn();
    let closeCalls = 0;
    const exit = vi.fn((_code: number) => undefined as never);

    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        closeCalls += 1;
        callback();
      }),
    } as unknown as Server;

    const pool = {
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pool;

    registerGracefulShutdown({
      server,
      pool,
      stopOutboxWorker,
      exit,
    });

    process.emit("SIGTERM");
    process.emit("SIGTERM");

    await vi.waitFor(() => {
      expect(stopOutboxWorker).toHaveBeenCalledOnce();
      expect(closeCalls).toBe(1);
      expect(exit).toHaveBeenCalledWith(0);
    });
  });
});
