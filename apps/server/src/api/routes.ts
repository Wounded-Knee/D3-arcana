import type { Express } from "express";

import { createUser } from "../repositories/users.js";
import {
    createConversation,
    getConversationById,
    getConversationMembers,
} from "../repositories/conversations.js";
import {
    createMessage,
    getMessages,
} from "../repositories/messages.js";

export function registerApiRoutes(app: Express): void {
  app.post("/users", async (req, res) => {
    try {
      const { displayName } = req.body;

      if (
        typeof displayName !== "string" ||
        displayName.trim() === ""
      ) {
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

  app.post("/conversations", async (req, res) => {
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
      console.error(
        "Failed to create conversation:",
        error,
      );

      res.status(500).json({
        error: "Failed to create conversation",
      });
    }
  });

  app.post(
    "/conversations/:conversationId/messages",
    async (req, res) => {
      try {
        const { conversationId } = req.params;
        const { senderId, content } = req.body;

        if (
          typeof senderId !== "string" ||
          typeof content !== "string" ||
          content.trim() === ""
        ) {
          res.status(400).json({
            error: "senderId and content are required",
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
    },
  );

  app.get(
    "/conversations/:conversationId",
    async (req, res) => {
      try {
        const { conversationId } = req.params;
  
        const conversation =
          await getConversationById(conversationId);
  
        if (!conversation) {
          res.status(404).json({
            error: "Conversation not found",
          });
          return;
        }
  
        const members =
          await getConversationMembers(conversationId);
  
        res.json({
          ...conversation,
          members,
        });
      } catch (error) {
        console.error(
          "Failed to get conversation:",
          error,
        );
  
        res.status(500).json({
          error: "Failed to get conversation",
        });
      }
    },
  );

  app.get(
    "/conversations/:conversationId/messages",
    async (req, res) => {
      try {
        const { conversationId } = req.params;
  
        const conversation =
          await getConversationById(conversationId);
  
        if (!conversation) {
          res.status(404).json({
            error: "Conversation not found",
          });
          return;
        }
  
        const messages =
          await getMessages(conversationId);
  
        res.json({
          messages,
        });
      } catch (error) {
        console.error(
          "Failed to get messages:",
          error,
        );
  
        res.status(500).json({
          error: "Failed to get messages",
        });
      }
    },
  );
}