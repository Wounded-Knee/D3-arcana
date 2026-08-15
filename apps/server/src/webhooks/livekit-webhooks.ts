import express, { type Express, type Request, type Response } from "express";

import {
  cancelEmptyRoomGrace,
  maybeScheduleGraceAfterLeave,
} from "../calls/call-grace-timer.js";
import { asyncHandler } from "../api/errors.js";
import {
  parseCallIdFromRoomName,
} from "../media/livekit-provider.js";
import { getMediaSessionProvider } from "../media/media-provider-instance.js";
import {
  endCall,
  getCallById,
  markParticipantLeft,
  upsertParticipantJoined,
} from "../repositories/calls.js";

interface LiveKitWebhookEvent {
  event: string;
  room?: {
    name?: string;
  };
  participant?: {
    identity?: string;
  };
}

function parseWebhookEvent(raw: unknown): LiveKitWebhookEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return raw as LiveKitWebhookEvent;
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

      let event: LiveKitWebhookEvent;

      try {
        event = parseWebhookEvent(
          getMediaSessionProvider().verifyWebhook(
            body,
            req.get("Authorization"),
          ),
        ) as LiveKitWebhookEvent;
      } catch (error) {
        console.error("[livekit-webhook] signature verification failed:", error);
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }

      if (!event?.event) {
        res.status(400).json({ error: "Invalid webhook payload" });
        return;
      }

      const roomName = event.room?.name;
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
          if (userId && call.status === "active") {
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
          if (userId && call.status === "active") {
            await markParticipantLeft(
              callId,
              call.conversationId,
              userId,
            );
            await maybeScheduleGraceAfterLeave(callId);
          }
          break;
        }

        case "room_finished": {
          if (call.status === "active") {
            cancelEmptyRoomGrace(callId);
            await endCall(callId, call.startedBy, "room_finished");
            try {
              await getMediaSessionProvider().endRoom(callId);
            } catch (error) {
              console.error(
                `[livekit-webhook] failed to delete room ${callId}:`,
                error,
              );
            }
          }
          break;
        }

        default:
          break;
      }

      res.status(200).json({ status: "ok" });
    }),
  );
}
