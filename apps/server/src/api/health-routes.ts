import type { Express, Response } from "express";

import { pool } from "../database.js";
import { getMediaSessionProvider } from "../media/media-provider-instance.js";

const DATABASE_HEALTH_TIMEOUT_MS = 2_000;

export type CheckStatus = "ok" | "error";

export interface DependencyCheck {
  status: CheckStatus;
  error?: string;
  time?: string;
}

export interface ReadyHealth {
  status: CheckStatus;
  database: DependencyCheck;
  livekit: DependencyCheck;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function checkDatabase(): Promise<DependencyCheck> {
  try {
    const result = await withTimeout(
      pool.query("SELECT NOW() AS now"),
      DATABASE_HEALTH_TIMEOUT_MS,
    );

    const now = result.rows[0]?.now;
    return {
      status: "ok",
      time: now instanceof Date ? now.toISOString() : String(now),
    };
  } catch (error) {
    return {
      status: "error",
      error: errorMessage(error, "disconnected"),
    };
  }
}

async function checkLiveKit(): Promise<DependencyCheck> {
  try {
    const result = await getMediaSessionProvider().checkHealth();

    if (result.ok) {
      return { status: "ok" };
    }

    return {
      status: "error",
      error: result.error ?? "unavailable",
    };
  } catch (error) {
    return {
      status: "error",
      error: errorMessage(error, "unavailable"),
    };
  }
}

function sendCheck(res: Response, key: "database" | "livekit", check: DependencyCheck): void {
  const status = check.status === "ok" ? 200 : 503;
  res.status(status).json({
    status: check.status,
    [key]: check,
  });
}

export function registerHealthRoutes(app: Express): void {
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/health/database", async (_req, res) => {
    sendCheck(res, "database", await checkDatabase());
  });

  app.get("/health/livekit", async (_req, res) => {
    sendCheck(res, "livekit", await checkLiveKit());
  });

  app.get("/health/ready", async (_req, res) => {
    const [database, livekit] = await Promise.all([
      checkDatabase(),
      checkLiveKit(),
    ]);

    const body: ReadyHealth = {
      status:
        database.status === "ok" && livekit.status === "ok" ? "ok" : "error",
      database,
      livekit,
    };

    res.status(body.status === "ok" ? 200 : 503).json(body);
  });
}
