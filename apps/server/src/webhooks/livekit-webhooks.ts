import express, { type Express, type Request, type Response } from "express";

import {
  cancelEmptyRoomGrace,
  maybeScheduleGraceAfterLeave,
} from "../calls/call-grace-timer.js";
import {
  completeTrackRecording,
  startTrackRecording,
  stopCallRecordings,
  stopTrackRecording,
} from "../calls/recording-lifecycle.js";
import { asyncHandler } from "../api/errors.js";
import {
  isMicrophoneAudioTrack,
  parseCallIdFromRoomName,
} from "../media/livekit-provider.js";
import { getMediaSessionProvider } from "../media/media-provider-instance.js";
import {
  endCall,
  getCallById,
  markParticipantLeft,
  upsertParticipantJoined,
} from "../repositories/calls.js";
import { getRecordingByEgressId } from "../repositories/recordings.js";

interface LiveKitWebhookEvent {
  event?: string;
  room?: {
    name?: string;
  };
  participant?: {
    identity?: string;
  };
  track?: {
    sid?: string;
    type?: unknown;
    source?: unknown;
  };
  egressInfo?: {
    egressId?: string;
    roomName?: string;
    status?: unknown;
    error?: string;
    fileResults?: Array<{
      duration?: bigint | number | string;
      size?: bigint | number | string;
      filename?: string;
    }>;
  };
}

const EGRESS_COMPLETE = new Set([3, "EGRESS_COMPLETE", "COMPLETE"]);
const EGRESS_FAILED = new Set([
  4,
  5,
  6,
  "EGRESS_FAILED",
  "EGRESS_ABORTED",
  "EGRESS_LIMIT_REACHED",
  "FAILED",
  "ABORTED",
  "LIMIT_REACHED",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const APP_USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAppUserIdentity(
  identity: string | undefined,
): identity is string {
  return typeof identity === "string" && APP_USER_ID.test(identity);
}

function parseWebhookEvent(raw: unknown): LiveKitWebhookEvent | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const room = asRecord(record.room);
  const participant = asRecord(record.participant);
  const track = asRecord(record.track);
  const egressInfo = asRecord(record.egressInfo) ?? asRecord(record.egress_info);

  return {
    event: readString(record.event),
    room: room ? { name: readString(room.name) } : undefined,
    participant: participant
      ? { identity: readString(participant.identity) }
      : undefined,
    track: track
      ? {
          sid: readString(track.sid),
          type: track.type,
          source: track.source,
        }
      : undefined,
    egressInfo: egressInfo
      ? {
          egressId: readString(egressInfo.egressId ?? egressInfo.egress_id),
          roomName: readString(egressInfo.roomName ?? egressInfo.room_name),
          status: egressInfo.status,
          error: readString(egressInfo.error),
          fileResults: Array.isArray(egressInfo.fileResults)
            ? (egressInfo.fileResults as NonNullable<
                LiveKitWebhookEvent["egressInfo"]
              >["fileResults"])
            : Array.isArray(egressInfo.file_results)
              ? (egressInfo.file_results as NonNullable<
                  LiveKitWebhookEvent["egressInfo"]
                >["fileResults"])
              : undefined,
        }
      : undefined,
  };
}

function egressSucceeded(status: unknown): boolean {
  if (status && typeof status === "object" && "value" in status) {
    return egressSucceeded((status as { value: unknown }).value);
  }

  return EGRESS_COMPLETE.has(status as never);
}

function egressFailed(status: unknown): boolean {
  if (status && typeof status === "object" && "value" in status) {
    return egressFailed((status as { value: unknown }).value);
  }

  return EGRESS_FAILED.has(status as never);
}

export function registerLiveKitWebhookRoute(app: Express): void {
  app.post(
    "/webhooks/livekit",
    express.raw({ type: "application/webhook+json" }),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body;
      if (!Buffer.isBuffer(body)) {
        res.status(400).json({ error: "Expected raw body" });
        return;
      }

      let event: LiveKitWebhookEvent | null;

      try {
        event = parseWebhookEvent(
          await getMediaSessionProvider().verifyWebhook(
            body,
            req.get("Authorization"),
          ),
        );
      } catch (error) {
        console.error("[livekit-webhook] signature verification failed:", error);
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }

      if (!event?.event) {
        res.status(400).json({ error: "Invalid webhook payload" });
        return;
      }

      const roomName = event.room?.name ?? event.egressInfo?.roomName;
      const callId = roomName ? parseCallIdFromRoomName(roomName) : null;

      if (!callId) {
        res.status(200).json({ status: "ignored" });
        return;
      }

      const call = await getCallById(callId);
      if (!call) {
        res.status(200).json({ status: "ignored" });
        return;
      }

      switch (event.event) {
        case "participant_joined": {
          const userId = event.participant?.identity;
          if (isAppUserIdentity(userId) && call.status === "active") {
            cancelEmptyRoomGrace(callId);
            await upsertParticipantJoined(
              callId,
              call.conversationId,
              userId,
              "publisher",
            );
          }
          break;
        }

        case "participant_left": {
          const userId = event.participant?.identity;
          if (isAppUserIdentity(userId) && call.status === "active") {
            await markParticipantLeft(
              callId,
              call.conversationId,
              userId,
            );
            await maybeScheduleGraceAfterLeave(callId);
          }
          break;
        }

        case "track_published": {
          const userId = event.participant?.identity;
          const trackSid = event.track?.sid;
          if (
            isAppUserIdentity(userId) &&
            trackSid &&
            call.status === "active" &&
            isMicrophoneAudioTrack(event.track?.type, event.track?.source)
          ) {
            cancelEmptyRoomGrace(callId);
            await startTrackRecording({
              callId,
              conversationId: call.conversationId,
              userId,
              trackSid,
              callStartedAt: call.startedAt,
            });
          }
          break;
        }

        case "track_unpublished": {
          const trackSid = event.track?.sid;
          if (trackSid) {
            await stopTrackRecording(callId, trackSid);
          }
          break;
        }

        case "egress_ended": {
          const egressId = event.egressInfo?.egressId;
          if (!egressId) {
            break;
          }

          const recording = await getRecordingByEgressId(egressId);
          if (!recording) {
            break;
          }

          const file = event.egressInfo?.fileResults?.[0];
          const success =
            egressSucceeded(event.egressInfo?.status) && !event.egressInfo?.error;

          await completeTrackRecording({
            recording,
            success: success && !egressFailed(event.egressInfo?.status),
            durationNs: file?.duration,
            sizeBytes: file?.size === undefined ? undefined : Number(file.size),
            error: event.egressInfo?.error,
          });
          break;
        }

        case "room_finished": {
          await stopCallRecordings(callId);
          if (call.status === "active") {
            cancelEmptyRoomGrace(callId);
            await endCall(callId, call.startedBy, "room_finished");
          }
          break;
        }

        default:
          break;
      }

      res.status(200).json({ status: "ok" });
      return;
    }),
  );
}
