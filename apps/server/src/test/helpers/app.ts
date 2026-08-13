import type { Express } from "express";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { vi } from "vitest";

import type { WebSocketManager } from "../../realtime/websocket-manager.js";

export async function createTestApp(): Promise<Express> {
  vi.resetModules();

  const express = (await import("express")).default;
  const { registerApiRoutes } = await import("../../api/routes.js");
  const { errorHandler } = await import("../../api/errors.js");

  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  app.use(errorHandler);

  return app;
}

export async function createAuthenticatedTestApp(
  tokenMap: Record<string, string>,
): Promise<Express> {
  process.env.DEV_AUTH_TOKENS = Object.entries(tokenMap)
    .map(([token, userId]) => `${token}:${userId}`)
    .join(",");

  return createTestApp();
}

export interface TestServer {
  app: Express;
  server: Server;
  manager: WebSocketManager;
  port: number;
  close: () => Promise<void>;
}

export async function createTestServer(
  tokenMap: Record<string, string> = {},
): Promise<TestServer> {
  if (Object.keys(tokenMap).length > 0) {
    process.env.DEV_AUTH_TOKENS = Object.entries(tokenMap)
      .map(([token, userId]) => `${token}:${userId}`)
      .join(",");
  }

  vi.resetModules();

  const express = (await import("express")).default;
  const { registerApiRoutes } = await import("../../api/routes.js");
  const { errorHandler } = await import("../../api/errors.js");
  const { WebSocketManager } = await import(
    "../../realtime/websocket-manager.js"
  );
  const { createWebSocketServer } = await import(
    "../../realtime/websocket-server.js"
  );
  const { registerConsumers } = await import("../../consumers/index.js");

  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  app.use(errorHandler);

  const server = createServer(app);
  const manager = new WebSocketManager();
  registerConsumers(manager);
  createWebSocketServer(server, manager);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server");
  }

  return {
    app,
    server,
    manager,
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
