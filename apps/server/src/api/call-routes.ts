import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";

import {
  asyncHandler,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "./errors.js";
import { conversationIdParamSchema } from "./schemas/http.js";
import { requireAuth } from "../auth/require-auth.js";
import {
  cancelEmptyRoomGrace,
  maybeScheduleGraceAfterLeave,
} from "../calls/call-grace-timer.js";
import { getMediaSessionProvider } from "../media/media-provider-instance.js";
import type { JoinRole } from "../media/types.js";
import {
  createCall,
  getActiveCallForConversation,
  getActiveCallWithParticipants,
  markParticipantLeft,
  upsertParticipantJoined,
} from "../repositories/calls.js";
import {
  getConversationById,
  isConversationMember,
} from "../repositories/conversations.js";
import { getUserById } from "../repositories/users.js";

const joinCallBodySchema = z.object({
  role: z.enum(["publisher", "subscriber"]).default("publisher"),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError("Invalid request", result.error.issues);
  }

  return result.data;
}

function parseParams<T>(schema: z.ZodType<T>, params: unknown): T {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new BadRequestError("Invalid request", result.error.issues);
  }

  return result.data;
}

export function registerCallRoutes(app: Express): void {
  const router = express.Router();

  router.post(
    "/conversations/:conversationId/calls/join",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId } = parseParams(
        conversationIdParamSchema,
        req.params,
      );
      const body = parseBody(joinCallBodySchema, req.body ?? {});
      const userId = req.user!.userId;
      const role = body.role as JoinRole;

      const conversation = await getConversationById(conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found");
      }

      const isMember = await isConversationMember(conversationId, userId);
      if (!isMember) {
        throw new ForbiddenError("Not a member of this conversation");
      }

      const user = await getUserById(userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      let call = await getActiveCallForConversation(conversationId);
      let created = false;

      if (!call) {
        call = await createCall(conversationId, userId, "audio");
        created = true;
      }

      cancelEmptyRoomGrace(call.id);
      await upsertParticipantJoined(
        call.id,
        conversationId,
        userId,
        role,
      );

      const mediaProvider = getMediaSessionProvider();
      await mediaProvider.ensureRoom(call.id);

      const credentials = await mediaProvider.issueJoinCredentials({
        callId: call.id,
        userId,
        displayName: user.displayName,
        role,
      });

      res.status(created ? 201 : 200).json({
        callId: call.id,
        provider: credentials.provider,
        url: credentials.url,
        token: credentials.token,
        expiresAt: credentials.expiresAt.toISOString(),
        role,
      });
    }),
  );

  router.post(
    "/conversations/:conversationId/calls/leave",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId } = parseParams(
        conversationIdParamSchema,
        req.params,
      );
      const userId = req.user!.userId;

      const conversation = await getConversationById(conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found");
      }

      const isMember = await isConversationMember(conversationId, userId);
      if (!isMember) {
        throw new ForbiddenError("Not a member of this conversation");
      }

      const call = await getActiveCallForConversation(conversationId);
      if (!call) {
        throw new NotFoundError("No active call");
      }

      await markParticipantLeft(call.id, conversationId, userId);
      await maybeScheduleGraceAfterLeave(call.id);

      res.status(204).send();
    }),
  );

  router.get(
    "/conversations/:conversationId/calls/active",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId } = parseParams(
        conversationIdParamSchema,
        req.params,
      );
      const userId = req.user!.userId;

      const conversation = await getConversationById(conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found");
      }

      const isMember = await isConversationMember(conversationId, userId);
      if (!isMember) {
        throw new ForbiddenError("Not a member of this conversation");
      }

      const active = await getActiveCallWithParticipants(conversationId);
      if (!active) {
        throw new NotFoundError("No active call");
      }

      res.json({
        call: {
          id: active.call.id,
          conversationId: active.call.conversationId,
          startedBy: active.call.startedBy,
          status: active.call.status,
          mediaMode: active.call.mediaMode,
          startedAt: active.call.startedAt.toISOString(),
        },
        participants: active.participants.map((participant) => ({
          userId: participant.userId,
          role: participant.role,
          displayName: participant.displayName,
          joinedAt: participant.joinedAt.toISOString(),
        })),
      });
    }),
  );

  app.use("/api/v1", router);
}
