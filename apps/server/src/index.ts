import "dotenv/config";
import express from "express";
import type { MessageCreatedEvent } from "@d3-arcana/events";
import { pool } from "./database.js";
import { createServer } from "node:http";
import { createWebSocketServer } from "./realtime/websocket-server.js";
import { WebSocketManager } from "./realtime/websocket-manager.js";

import { eventBus } from "./events/index.js";
import { publishPendingEvents } from "./events/index.js";
import { startOutboxWorker } from "./events/outbox-worker.js";

import { registerConsumers } from "./consumers/index.js";

import { createUser } from "./repositories/users.js";
import { createConversation } from "./repositories/conversations.js";
import { createMessage } from "./repositories/messages.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get("/test/events", (_req, res) => {
  res.json(eventBus.getEvents());
});

app.post("/test/messages", async (req, res) => {
  try {
    const {
      conversationId,
      senderId,
      content,
    } = req.body;

    if (
      typeof conversationId !== "string" ||
      typeof senderId !== "string" ||
      typeof content !== "string" ||
      content.trim() === ""
    ) {
      res.status(400).json({
        error: "conversationId, senderId, and content are required",
      });
      return;
    }

    const message = await createMessage(
      conversationId,
      senderId,
      content.trim(),
    );

    res.status(201).json(message);
  } catch (error) {
    console.error("Failed to create message:", error);

    res.status(500).json({
      error: "Failed to create message",
    });
  }
});

app.post("/test/conversations", async (req, res) => {
  try {
    const { name, createdBy } = req.body;

    if (
      typeof name !== "string" ||
      name.trim() === "" ||
      typeof createdBy !== "string" ||
      createdBy.trim() === ""
    ) {
      res.status(400).json({
        error: "name and createdBy are required",
      });
      return;
    }

    const conversation = await createConversation(
      name.trim(),
      createdBy,
    );

    res.status(201).json(conversation);
  } catch (error) {
    console.error("Failed to create conversation:", error);

    res.status(500).json({
      error: "Failed to create conversation",
    });
  }
});

app.post("/test/users", async (req, res) => {
  try {
    const { displayName } = req.body;

    if (typeof displayName !== "string" || displayName.trim() === "") {
      res.status(400).json({
        error: "displayName is required",
      });
      return;
    }

    const user = await createUser(displayName.trim());

    res.status(201).json(user);
  } catch (error) {
    console.error("Failed to create user:", error);

    res.status(500).json({
      error: "Failed to create user",
    });
  }
});

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

app.get("/test-event", (_req, res) => {
  const event: MessageCreatedEvent = {
    eventId: "test-event-1",
    type: "message.created",
    timestamp: new Date().toISOString(),
    conversationId: "conversation-1",
    actorId: "alice",
    payload: {
      messageId: "message-1",
      content: "Hello, world!",
    },
  };

  res.json(event);
});

const server = createServer(app);
const webSocketManager = new WebSocketManager();
registerConsumers(webSocketManager);
createWebSocketServer(server, webSocketManager);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

const stopOutboxWorker = startOutboxWorker();