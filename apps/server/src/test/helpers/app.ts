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
  process.env.OBJECT_STORE_ENDPOINT ??= "http://127.0.0.1:9000";
  process.env.OBJECT_STORE_BUCKET ??= "arcana-recordings";
  process.env.OBJECT_STORE_ACCESS_KEY ??= "minio";
  process.env.OBJECT_STORE_SECRET_KEY ??= "minio12345";
  process.env.OBJECT_STORE_REGION ??= "us-east-1";
  process.env.OBJECT_STORE_FORCE_PATH_STYLE ??= "true";
  process.env.EGRESS_INGEST_SECRET ??= "test-egress-secret";
  process.env.EGRESS_INGEST_URL ??= "ws://127.0.0.1:3000/internal/egress";

  const { MockMediaSessionProvider } = await import(
    "../../media/mock-media-provider.js"
  );
  const { setMediaSessionProviderForTests } = await import(
    "../../media/media-provider-instance.js"
  );
  const { createTestObjectStore } = await import(
    "../../storage/object-store-instance.js"
  );

  setMediaSessionProviderForTests(new MockMediaSessionProvider());
  createTestObjectStore();
}

export async function createTestApp(): Promise<Express> {
  vi.resetModules();
  await configureTestMediaEnv();

  const express = (await import("express")).default;
  const { registerApiRoutes } = await import("../../api/routes.js");
  const { registerCallRoutes } = await import("../../api/call-routes.js");
  const { registerHealthRoutes } = await import("../../api/health-routes.js");
  const { registerLiveKitWebhookRoute } = await import(
    "../../webhooks/livekit-webhooks.js"
  );
  const { errorHandler } = await import("../../api/errors.js");

  const app = express();
  registerLiveKitWebhookRoute(app);
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
  const { registerLiveKitWebhookRoute } = await import(
    "../../webhooks/livekit-webhooks.js"
  );
  const { errorHandler } = await import("../../api/errors.js");
  const { WebSocketManager } = await import(
    "../../realtime/websocket-manager.js"
  );
  const { attachWebSocketServers } = await import(
    "../../realtime/attach-websockets.js"
  );
  const { registerConsumers } = await import("../../consumers/index.js");

  const manager = new WebSocketManager();
  const app = express();
  registerLiveKitWebhookRoute(app);
  app.use(express.json());
  registerApiRoutes(app);
  registerCallRoutes(app, manager);
  registerHealthRoutes(app);
  app.use(errorHandler);

  const server = createServer(app);
  registerConsumers(manager);
  attachWebSocketServers(server, manager);

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
