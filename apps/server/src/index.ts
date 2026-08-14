import "dotenv/config";
import express from "express";
import { pool } from "./database.js";
import { createServer } from "node:http";
import { createWebSocketServer } from "./realtime/websocket-server.js";
import { WebSocketManager } from "./realtime/websocket-manager.js";

import { eventBus } from "./events/event-bus-instance.js";
import { publishPendingEvents } from "./events/index.js";
import { startOutboxWorker } from "./events/outbox-worker.js";

import { registerConsumers } from "./consumers/index.js";

import { registerApiRoutes } from "./api/routes.js";
import { errorHandler } from "./api/errors.js";
import { logDevelopmentEndpoints } from "./dev/network.js";
import { registerDevCors } from "./dev/cors.js";
import { registerDevRequestLogger } from "./dev/request-logger.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

registerDevCors(app);
registerDevRequestLogger(app);
app.use(express.json());
registerApiRoutes(app);

if (process.env.NODE_ENV !== "production") {
  app.get("/test/events", (_req, res) => {
    res.json(eventBus.getEvents());
  });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/database", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");

    res.json({
      status: "ok",
      database: "connected",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

app.use(errorHandler);

const server = createServer(app);
const webSocketManager = new WebSocketManager();
registerConsumers(webSocketManager);
createWebSocketServer(server, webSocketManager);

server.listen(port, "0.0.0.0", () => {
  logDevelopmentEndpoints(port);
});

const stopOutboxWorker = startOutboxWorker();
