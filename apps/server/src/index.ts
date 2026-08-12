import "dotenv/config";
import express from "express";
import type { MessageCreatedEvent } from "@d3-arcana/events";
import { pool } from "./database.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

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

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});