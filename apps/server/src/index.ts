import "dotenv/config";
import express from "express";
import type { MessageCreatedEvent } from "@d3-arcana/events";
import { pool } from "./database.js";
import { createUser } from "./repositories/users.js";
import { createConversation } from "./repositories/conversations.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

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

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});