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
import {
    createConversationSchema,
    createMessageSchema,
    createUserSchema,
  } from "./schemas/http.js";

export function registerApiRoutes(app: Express): void {
  app.post("/users", async (req, res) => {
    try {
        const result = createUserSchema.safeParse(req.body);

        if (!result.success) {
            res.status(400).json({
            error: "Invalid request",
            details: result.error.issues,
            });
        
            return;
        }
        
        const user = await createUser(
            result.data.displayName,
        );

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
    const result =
        createConversationSchema.safeParse(req.body);
      
      if (!result.success) {
        res.status(400).json({
          error: "Invalid request",
          details: result.error.issues,
        });
      
        return;
      }
      
      const conversation = await createConversation(
        result.data.name,
        result.data.createdBy,
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
              const result =
                  createMessageSchema.safeParse(req.body);

              if (!result.success) {
                  res.status(400).json({
                      error: "Invalid request",
                      details: result.error.issues,
                  });

                  return;
              }

              const message = await createMessage(
                  req.params.conversationId,
                  result.data.senderId,
                  result.data.content,
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