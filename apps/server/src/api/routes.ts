import express, { type Express } from "express";
import { z } from "zod";

import {
  asyncHandler,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "./errors.js";
import {
  addConversationMemberSchema,
  conversationIdParamSchema,
  createConversationSchema,
  createMessageSchema,
  createUserSchema,
  listMessagesQuerySchema,
  userIdParamSchema,
} from "./schemas/http.js";
import { requireAuth } from "../auth/require-auth.js";
import { createUser, getUserById } from "../repositories/users.js";
import {
  addConversationMember,
  createConversation,
  getConversationById,
  getConversationMembers,
  getConversationsForUser,
  isConversationMember,
} from "../repositories/conversations.js";
import {
  createMessage,
  getMessageWithSender,
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
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await getUserById(req.user!.userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      res.json(user);
    }),
  );

  router.get(
    "/me/conversations",
    requireAuth,
    asyncHandler(async (req, res) => {
      const conversations = await getConversationsForUser(req.user!.userId);
      res.json({ conversations });
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
    requireAuth,
    asyncHandler(async (req, res) => {
      const { userId } = parseParams(userIdParamSchema, req.params);

      if (req.user!.userId !== userId) {
        throw new ForbiddenError("Cannot access another user's conversations");
      }

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
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = parseBody(createConversationSchema, req.body);

      const conversation = await createConversation(
        body.name,
        req.user!.userId,
      );
      res.status(201).json(conversation);
    }),
  );

  router.get(
    "/conversations/:conversationId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId } = parseParams(
        conversationIdParamSchema,
        req.params,
      );

      const conversation = await getConversationById(conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found");
      }

      const isMember = await isConversationMember(
        conversationId,
        req.user!.userId,
      );
      if (!isMember) {
        throw new ForbiddenError("Not a member of this conversation");
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
    requireAuth,
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

      const isMember = await isConversationMember(
        conversationId,
        req.user!.userId,
      );
      if (!isMember) {
        throw new ForbiddenError("Not a member of this conversation");
      }

      const { messages, hasMore } = await getMessages(conversationId, {
        limit: query.limit,
        before: query.before,
      });

      res.json({ messages, hasMore });
    }),
  );

  router.post(
    "/conversations/:conversationId/members",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId } = parseParams(
        conversationIdParamSchema,
        req.params,
      );
      const body = parseBody(addConversationMemberSchema, req.body);

      const conversation = await getConversationById(conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found");
      }

      const isMember = await isConversationMember(
        conversationId,
        req.user!.userId,
      );
      if (!isMember) {
        throw new ForbiddenError("Not a member of this conversation");
      }

      const user = await getUserById(body.userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      const membership = await addConversationMember(
        conversationId,
        body.userId,
      );

      res.status(201).json({
        conversationId,
        userId: membership!.userId,
        joinedAt: membership!.joinedAt,
      });
    }),
  );

  router.post(
    "/conversations/:conversationId/messages",
    requireAuth,
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

      const isMember = await isConversationMember(
        conversationId,
        req.user!.userId,
      );
      if (!isMember) {
        throw new ForbiddenError("Not a member of this conversation");
      }

      const message = await createMessage(
        conversationId,
        req.user!.userId,
        body.content,
      );

      const enriched = await getMessageWithSender(message.id);
      if (!enriched) {
        throw new NotFoundError("Message not found");
      }

      res.status(201).json(enriched);
    }),
  );

  app.use("/api/v1", router);
}
