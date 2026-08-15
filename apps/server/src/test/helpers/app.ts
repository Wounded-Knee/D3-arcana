import type { Express } from "express";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { vi } from "vitest";

import type { WebSocketManager } from "../../realtime/websocket-manager.js";

async function configureTestMediaEnv(): Promise<void> {
  process.env.LIVEKIT_URL ??= "http://127.0.0.1:7880";
  process.env.LIVEKIT_API_KEY ??= "devkey";
  process.env.LIVEKIT_API_SECRET ??= "devsecret";
  process.env.LIVEKIT_WEBHOOK_SECRET ??= "devsecret";
  process.env.CALL_EMPTY_GRACE_MS ??= "45000";

  const { MockMediaSessionProvider } = await import(
    "../../media/mock-media-provider.js"
  );
  const { setMediaSessionProviderForTests } = await import(
    "../../media/media-provider-instance.js"
  );

  setMediaSessionProviderForTests(new MockMediaSessionProvider());
}

export async function createTestApp(): Promise<Express> {
  vi.resetModules();
  await configureTestMediaEnv();

  const express = (await import("express")).default;
  const { registerApiRoutes } = await import("../../api/routes.js");
  const { registerCallRoutes } = await import("../../api/call-routes.js");
  const { registerHealthRoutes } = await import("../../api/health-routes.js");
  const { errorHandler } = await import("../../api/errors.js");

  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  registerCallRoutes(app);
  registerHealthRoutes(app);
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
  await configureTestMediaEnv();

  const express = (await import("express")).default;
  const { registerApiRoutes } = await import("../../api/routes.js");
  const { registerCallRoutes } = await import("../../api/call-routes.js");
  const { registerHealthRoutes } = await import("../../api/health-routes.js");
  const { errorHandler } = await import("../../api/errors.js");
  const { WebSocketManager } = await import(
    "../../realtime/websocket-manager.js"
  );
  const { createWebSocketServer } = await import(
    "../../realtime/websocket-server.js"
  );
  const { registerConsumers } = await import("../../consumers/index.js");

  const manager = new WebSocketManager();
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  registerCallRoutes(app, manager);
  registerHealthRoutes(app);
  app.use(errorHandler);

  const server = createServer(app);
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
