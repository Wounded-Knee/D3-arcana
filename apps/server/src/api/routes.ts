import express, { type Express } from "express";
import { z } from "zod";

import {
  asyncHandler,
  BadRequestError,
  NotFoundError,
} from "./errors.js";
import {
  conversationIdParamSchema,
  createConversationSchema,
  createMessageSchema,
  createUserSchema,
  listMessagesQuerySchema,
  userIdParamSchema,
} from "./schemas/http.js";
import { createUser, getUserById } from "../repositories/users.js";
import {
  createConversation,
  getConversationById,
  getConversationMembers,
  getConversationsForUser,
} from "../repositories/conversations.js";
import {
  createMessage,
  getMessages,
} from "../repositories/messages.js";

function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError("Invalid request", result.error.issues);
  }
  return result.data;
}

function parseParams<T>(
  schema: z.ZodType<T>,
  params: unknown,
): T {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new BadRequestError("Invalid request", result.error.issues);
  }
  return result.data;
}

function parseQuery<T>(
  schema: z.ZodType<T>,
  query: unknown,
): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new BadRequestError("Invalid request", result.error.issues);
  }
  return result.data;
}

export function registerApiRoutes(app: Express): void {
  const router = express.Router();

  router.post(
    "/users",
    asyncHandler(async (req, res) => {
      const body = parseBody(createUserSchema, req.body);
      const user = await createUser(body.displayName);
      res.status(201).json(user);
    }),
  );

  router.get(
    "/users/:userId",
    asyncHandler(async (req, res) => {
      const { userId } = parseParams(userIdParamSchema, req.params);
      const user = await getUserById(userId);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      res.json(user);
    }),
  );

  router.get(
    "/users/:userId/conversations",
    asyncHandler(async (req, res) => {
      const { userId } = parseParams(userIdParamSchema, req.params);

      const user = await getUserById(userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      const conversations = await getConversationsForUser(userId);
      res.json({ conversations });
    }),
  );

  router.post(
    "/conversations",
    asyncHandler(async (req, res) => {
      const body = parseBody(createConversationSchema, req.body);

      const creator = await getUserById(body.createdBy);
      if (!creator) {
        throw new BadRequestError("createdBy user does not exist");
      }

      const conversation = await createConversation(
        body.name,
        body.createdBy,
      );
      res.status(201).json(conversation);
    }),
  );

  router.get(
    "/conversations/:conversationId",
    asyncHandler(async (req, res) => {
      const { conversationId } = parseParams(
        conversationIdParamSchema,
        req.params,
      );

      const conversation = await getConversationById(conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found");
      }

      const members = await getConversationMembers(conversationId);
      res.json({
        ...conversation,
        members,
      });
    }),
  );

  router.get(
    "/conversations/:conversationId/messages",
    asyncHandler(async (req, res) => {
      const { conversationId } = parseParams(
        conversationIdParamSchema,
        req.params,
      );
      const query = parseQuery(listMessagesQuerySchema, req.query);

      const conversation = await getConversationById(conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found");
      }

      const { messages, hasMore } = await getMessages(conversationId, {
        limit: query.limit,
        before: query.before,
      });

      res.json({ messages, hasMore });
    }),
  );

  router.post(
    "/conversations/:conversationId/messages",
    asyncHandler(async (req, res) => {
      const { conversationId } = parseParams(
        conversationIdParamSchema,
        req.params,
      );
      const body = parseBody(createMessageSchema, req.body);

      const conversation = await getConversationById(conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found");
      }

      const message = await createMessage(
        conversationId,
        body.senderId,
        body.content,
      );

      res.status(201).json(message);
    }),
  );

  app.use("/api/v1", router);
}
