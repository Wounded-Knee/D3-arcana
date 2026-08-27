import express, { type Express } from "express";
import { z } from "zod";
import type { ServerMessage } from "@d3-arcana/protocol";

import {
  asyncHandler,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "./errors.js";
import {
  conversationCallAnnotationParamsSchema,
  conversationCallParamsSchema,
  conversationCallRecordingParamsSchema,
  conversationCallSelectionParamsSchema,
  conversationIdParamSchema,
  createAnnotationSchema,
  createSelectionSchema,
  updateAnnotationSchema,
  updateSelectionSchema,
  upsertAnnotationRatificationSchema,
} from "./schemas/http.js";
import { requireAuth } from "../auth/require-auth.js";
import {
  cancelEmptyRoomGrace,
  maybeScheduleGraceAfterLeave,
} from "../calls/call-grace-timer.js";
import {
  WAVEFORM_MAX_AMPLITUDES_PER_POST,
  WAVEFORM_MAX_OFFSET_MS,
} from "../calls/waveform.js";
import { getMediaSessionProvider } from "../media/media-provider-instance.js";
import type { JoinRole } from "../media/types.js";
import {
  createCall,
  getActiveCallForConversation,
  getActiveCallWithParticipants,
  getCallById,
  isActiveCallParticipant,
  markParticipantLeft,
  upsertParticipantJoined,
} from "../repositories/calls.js";
import {
  getCallForConversation,
  listCallsForConversation,
  listRecordingsForCall,
} from "../repositories/recordings.js";
import { listFragmentsForCall } from "../repositories/recording-fragments.js";
import { buildRecordingMedia } from "../calls/concat-recording.js";
import {
  PLAYBACK_URL_TTL_SECONDS,
} from "../storage/types.js";
import { getObjectStore } from "../storage/object-store-instance.js";
import {
  getCallTimelineTracks,
  upsertWaveformSamples,
} from "../repositories/waveform.js";
import {
  getConversationById,
  isConversationMember,
} from "../repositories/conversations.js";
import { getUserById } from "../repositories/users.js";
import {
  AnnotationConflictError,
  AnnotationForbiddenError,
  AnnotationValidationError,
  createCallAnnotation,
  createCallSelection,
  deleteCallAnnotation,
  deleteCallSelection,
  getCallAnnotationById,
  getCallSelectionById,
  listAnnotationProfiles,
  listCallAnnotations,
  listCallSelections,
  serializeAnnotation,
  serializeAnnotationForViewer,
  serializeAnnotationsForViewer,
  serializeSelection,
  updateCallAnnotation,
  updateCallSelection,
  upsertAnnotationRatification,
} from "../repositories/annotations.js";

const joinCallBodySchema = z.object({
  role: z.enum(["publisher", "subscriber"]).default("publisher"),
});

const waveformBodySchema = z.object({
  startOffsetMs: z
    .number()
    .int()
    .nonnegative()
    .max(WAVEFORM_MAX_OFFSET_MS),
  amplitudes: z
    .array(z.number().int().min(0).max(255))
    .min(1)
    .max(WAVEFORM_MAX_AMPLITUDES_PER_POST),
});

export type ConversationBroadcaster = {
  broadcastToConversation: (
    conversationId: string,
    message: ServerMessage,
  ) => void;
};

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

export function registerCallRoutes(
  app: Express,
  broadcaster?: ConversationBroadcaster,
): void {
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

  router.post(
    "/conversations/:conversationId/calls/waveform",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId } = parseParams(
        conversationIdParamSchema,
        req.params,
      );
      const body = parseBody(waveformBodySchema, req.body ?? {});
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

      const isParticipant = await isActiveCallParticipant(call.id, userId);
      if (!isParticipant) {
        throw new ForbiddenError("Not an active call participant");
      }

      const chunks = await upsertWaveformSamples(
        call.id,
        userId,
        body.startOffsetMs,
        body.amplitudes,
      );

      for (const chunk of chunks) {
        broadcaster?.broadcastToConversation(conversationId, {
          type: "call.waveform.chunk",
          conversationId,
          callId: call.id,
          userId,
          startOffsetMs: chunk.startOffsetMs,
          sampleRateHz: chunk.sampleRateHz,
          amplitudes: chunk.amplitudes,
        });
      }

      res.status(204).send();
    }),
  );

  router.get(
    "/conversations/:conversationId/calls/active/timeline",
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

      const tracks = await getCallTimelineTracks(call.id);

      res.json({
        call: {
          id: call.id,
          startedAt: call.startedAt.toISOString(),
          endedAt: call.endedAt?.toISOString() ?? null,
        },
        tracks: tracks.map((track) => ({
          userId: track.userId,
          displayName: track.displayName,
          sessions: track.sessions.map((session) => ({
            joinedAt: session.joinedAt.toISOString(),
            leftAt: session.leftAt?.toISOString() ?? null,
          })),
          chunks: track.chunks.map((chunk) => ({
            startOffsetMs: chunk.startOffsetMs,
            sampleRateHz: chunk.sampleRateHz,
            amplitudes: chunk.amplitudes,
          })),
        })),
      });
    }),
  );

  router.get(
    "/conversations/:conversationId/calls",
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

      const calls = await listCallsForConversation(conversationId);
      const recordingsByCall = await Promise.all(
        calls.map(async (call) => ({
          call,
          recordings: await listRecordingsForCall(call.id),
        })),
      );

      res.json({
        calls: recordingsByCall.map(({ call, recordings }) => ({
          id: call.id,
          conversationId: call.conversationId,
          startedBy: call.startedBy,
          status: call.status,
          mediaMode: call.mediaMode,
          startedAt: call.startedAt.toISOString(),
          endedAt: call.endedAt?.toISOString() ?? null,
          recordings: summarizeRecordings(recordings),
        })),
      });
    }),
  );

  router.get(
    "/conversations/:conversationId/calls/:callId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId } = parseParams(
        conversationCallParamsSchema,
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

      const call = await getCallForConversation(conversationId, callId);
      if (!call) {
        throw new NotFoundError("Call not found");
      }

      res.json({
        call: {
          id: call.id,
          conversationId: call.conversationId,
          startedBy: call.startedBy,
          status: call.status,
          mediaMode: call.mediaMode,
          startedAt: call.startedAt.toISOString(),
          endedAt: call.endedAt?.toISOString() ?? null,
        },
      });
    }),
  );

  router.get(
    "/conversations/:conversationId/calls/:callId/timeline",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId } = parseParams(
        conversationCallParamsSchema,
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

      const call = await getCallById(callId);
      if (!call || call.conversationId !== conversationId) {
        throw new NotFoundError("Call not found");
      }

      const tracks = await getCallTimelineTracks(call.id);

      res.json({
        call: {
          id: call.id,
          startedAt: call.startedAt.toISOString(),
          endedAt: call.endedAt?.toISOString() ?? null,
        },
        tracks: tracks.map((track) => ({
          userId: track.userId,
          displayName: track.displayName,
          sessions: track.sessions.map((session) => ({
            joinedAt: session.joinedAt.toISOString(),
            leftAt: session.leftAt?.toISOString() ?? null,
          })),
          chunks: track.chunks.map((chunk) => ({
            startOffsetMs: chunk.startOffsetMs,
            sampleRateHz: chunk.sampleRateHz,
            amplitudes: chunk.amplitudes,
          })),
        })),
      });
    }),
  );

  router.get(
    "/conversations/:conversationId/calls/:callId/recordings",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId } = parseParams(
        conversationCallParamsSchema,
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

      const call = await getCallForConversation(conversationId, callId);
      if (!call) {
        throw new NotFoundError("Call not found");
      }

      const [sessions, fragments] = await Promise.all([
        listRecordingsForCall(callId),
        listFragmentsForCall(callId),
      ]);
      const store = getObjectStore();

      res.json({
        call: {
          id: call.id,
          startedAt: call.startedAt.toISOString(),
          endedAt: call.endedAt?.toISOString() ?? null,
        },
        sessions: sessions.map((session) => ({
          id: session.id,
          callId: session.callId,
          userId: session.userId,
          status: session.status,
          callOffsetMs: session.callOffsetMs,
          durationMs: session.durationMs,
          objectKey: session.objectKey,
          error: session.error,
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt?.toISOString() ?? null,
        })),
        recordings: await Promise.all(
          fragments.map(async (fragment) => ({
            id: fragment.id,
            recordingId: fragment.recordingId,
            callId: fragment.callId,
            userId: fragment.userId,
            status: "ready",
            callOffsetMs: fragment.callOffsetMs,
            durationMs: fragment.durationMs,
            objectKey: fragment.objectKey,
            contentType: "audio/wav",
            format: "wav",
            error: null,
            startedAt: call.startedAt.toISOString(),
            endedAt: null,
            playbackUrl: await store.issueReadUrl(
              fragment.objectKey,
              PLAYBACK_URL_TTL_SECONDS,
            ),
          })),
        ),
      });
    }),
  );

  router.get(
    "/conversations/:conversationId/calls/:callId/recordings/:recordingId/media",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId, recordingId } = parseParams(
        conversationCallRecordingParamsSchema,
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

      const call = await getCallForConversation(conversationId, callId);
      if (!call) {
        throw new NotFoundError("Call not found");
      }

      const media = await buildRecordingMedia(recordingId, callId);
      if (!media) {
        throw new NotFoundError("Recording media not found");
      }

      res.json(media);
    }),
  );

  router.get(
    "/annotation-profiles",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const profiles = await listAnnotationProfiles();
      res.json({
        profiles: profiles.map((profile) => ({
          id: profile.id,
          key: profile.key,
          name: profile.name,
          color: profile.color,
          icon: profile.icon,
          sortOrder: profile.sortOrder,
        })),
      });
    }),
  );

  router.get(
    "/conversations/:conversationId/calls/:callId/selections",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId } = parseParams(
        conversationCallParamsSchema,
        req.params,
      );
      await requireCallMember(conversationId, callId, req.user!.userId);
      const selections = await listCallSelections(callId);
      res.json({ selections: selections.map(serializeSelection) });
    }),
  );

  router.post(
    "/conversations/:conversationId/calls/:callId/selections",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId } = parseParams(
        conversationCallParamsSchema,
        req.params,
      );
      const body = parseBody(createSelectionSchema, req.body ?? {});
      await requireCallMember(conversationId, callId, req.user!.userId);
      try {
        const selection = await createCallSelection({
          callId,
          conversationId,
          createdBy: req.user!.userId,
          startOffsetMs: body.startOffsetMs,
          endOffsetMs: body.endOffsetMs,
          userId: body.userId,
        });
        res.status(201).json(serializeSelection(selection));
      } catch (error) {
        throw mapAnnotationError(error);
      }
    }),
  );

  router.patch(
    "/conversations/:conversationId/calls/:callId/selections/:selectionId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId, selectionId } = parseParams(
        conversationCallSelectionParamsSchema,
        req.params,
      );
      const body = parseBody(updateSelectionSchema, req.body ?? {});
      await requireCallMember(conversationId, callId, req.user!.userId);
      const existing = await getCallSelectionById(selectionId);
      if (!existing || existing.callId !== callId) {
        throw new NotFoundError("Selection not found");
      }
      try {
        const selection = await updateCallSelection({
          selectionId,
          actorId: req.user!.userId,
          startOffsetMs: body.startOffsetMs,
          endOffsetMs: body.endOffsetMs,
          userId: body.userId,
        });
        res.json(serializeSelection(selection));
      } catch (error) {
        throw mapAnnotationError(error);
      }
    }),
  );

  router.delete(
    "/conversations/:conversationId/calls/:callId/selections/:selectionId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId, selectionId } = parseParams(
        conversationCallSelectionParamsSchema,
        req.params,
      );
      await requireCallMember(conversationId, callId, req.user!.userId);
      const existing = await getCallSelectionById(selectionId);
      if (!existing || existing.callId !== callId) {
        throw new NotFoundError("Selection not found");
      }
      try {
        await deleteCallSelection({
          selectionId,
          actorId: req.user!.userId,
        });
        res.status(204).send();
      } catch (error) {
        throw mapAnnotationError(error);
      }
    }),
  );

  router.get(
    "/conversations/:conversationId/calls/:callId/annotations",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId } = parseParams(
        conversationCallParamsSchema,
        req.params,
      );
      await requireCallMember(conversationId, callId, req.user!.userId);
      const annotations = await listCallAnnotations(callId);
      res.json({
        annotations: await serializeAnnotationsForViewer(
          annotations,
          req.user!.userId,
        ),
      });
    }),
  );

  router.post(
    "/conversations/:conversationId/calls/:callId/annotations",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId } = parseParams(
        conversationCallParamsSchema,
        req.params,
      );
      const body = parseBody(createAnnotationSchema, req.body ?? {});
      await requireCallMember(conversationId, callId, req.user!.userId);
      try {
        const annotation = await createCallAnnotation({
          callId,
          conversationId,
          createdBy: req.user!.userId,
          profileId: body.profileId,
          selectionId: body.selectionId,
          startOffsetMs: body.startOffsetMs,
          endOffsetMs: body.endOffsetMs,
          userId: body.userId,
        });
        res.status(201).json(
          await serializeAnnotationForViewer(annotation, req.user!.userId),
        );
      } catch (error) {
        throw mapAnnotationError(error);
      }
    }),
  );

  router.patch(
    "/conversations/:conversationId/calls/:callId/annotations/:annotationId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId, annotationId } = parseParams(
        conversationCallAnnotationParamsSchema,
        req.params,
      );
      const body = parseBody(updateAnnotationSchema, req.body ?? {});
      await requireCallMember(conversationId, callId, req.user!.userId);
      const existing = await getCallAnnotationById(annotationId);
      if (!existing || existing.callId !== callId) {
        throw new NotFoundError("Annotation not found");
      }
      try {
        const annotation = await updateCallAnnotation({
          annotationId,
          actorId: req.user!.userId,
          note: body.note,
          selectionId: body.selectionId,
          startOffsetMs: body.startOffsetMs,
          endOffsetMs: body.endOffsetMs,
          userId: body.userId,
        });
        res.json(
          await serializeAnnotationForViewer(annotation, req.user!.userId),
        );
      } catch (error) {
        throw mapAnnotationError(error);
      }
    }),
  );

  router.put(
    "/conversations/:conversationId/calls/:callId/annotations/:annotationId/ratification",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId, annotationId } = parseParams(
        conversationCallAnnotationParamsSchema,
        req.params,
      );
      const body = parseBody(upsertAnnotationRatificationSchema, req.body ?? {});
      await requireCallMember(conversationId, callId, req.user!.userId);
      const existing = await getCallAnnotationById(annotationId);
      if (!existing || existing.callId !== callId) {
        throw new NotFoundError("Annotation not found");
      }
      try {
        const { record, ratification } = await upsertAnnotationRatification({
          annotationId,
          actorId: req.user!.userId,
          stance: body.stance,
        });
        res.json(serializeAnnotation(record, ratification));
      } catch (error) {
        throw mapAnnotationError(error);
      }
    }),
  );

  router.delete(
    "/conversations/:conversationId/calls/:callId/annotations/:annotationId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { conversationId, callId, annotationId } = parseParams(
        conversationCallAnnotationParamsSchema,
        req.params,
      );
      await requireCallMember(conversationId, callId, req.user!.userId);
      const existing = await getCallAnnotationById(annotationId);
      if (!existing || existing.callId !== callId) {
        throw new NotFoundError("Annotation not found");
      }
      try {
        await deleteCallAnnotation({
          annotationId,
          actorId: req.user!.userId,
        });
        res.status(204).send();
      } catch (error) {
        throw mapAnnotationError(error);
      }
    }),
  );

  app.use("/api/v1", router);
}

async function requireCallMember(
  conversationId: string,
  callId: string,
  userId: string,
): Promise<void> {
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  const isMember = await isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ForbiddenError("Not a member of this conversation");
  }

  const call = await getCallById(callId);
  if (!call || call.conversationId !== conversationId) {
    throw new NotFoundError("Call not found");
  }
}

function mapAnnotationError(error: unknown): never {
  if (error instanceof AnnotationValidationError) {
    if (error.message.endsWith("not found")) {
      throw new NotFoundError(error.message);
    }
    throw new BadRequestError(error.message);
  }

  if (error instanceof AnnotationForbiddenError) {
    throw new ForbiddenError(error.message);
  }

  if (error instanceof AnnotationConflictError) {
    throw new ConflictError(error.message);
  }

  throw error;
}

function summarizeRecordings(
  recordings: Awaited<ReturnType<typeof listRecordingsForCall>>,
) {
  const byUser = new Map<
    string,
    { userId: string; statuses: string[]; segmentCount: number }
  >();

  for (const recording of recordings) {
    const current = byUser.get(recording.userId) ?? {
      userId: recording.userId,
      statuses: [],
      segmentCount: 0,
    };
    current.statuses.push(recording.status);
    current.segmentCount += 1;
    byUser.set(recording.userId, current);
  }

  return [...byUser.values()].map((entry) => ({
    userId: entry.userId,
    status: recordingSummaryStatus(entry.statuses),
    segmentCount: entry.segmentCount,
  }));
}

function recordingSummaryStatus(statuses: string[]): string {
  if (statuses.includes("failed") && !statuses.includes("recording") && !statuses.includes("starting") && !statuses.some((status) => status === "ready" && statuses.indexOf("ready") > statuses.lastIndexOf("failed"))) {
    const last = statuses[statuses.length - 1];
    return last ?? "failed";
  }

  return statuses[statuses.length - 1] ?? "starting";
}
