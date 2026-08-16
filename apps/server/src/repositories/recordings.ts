import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../database.js";
import { callRecordings, calls, outboxEvents } from "../db/schema.js";
import {
  RECORDING_CONTENT_TYPE,
  RECORDING_FORMAT,
} from "../storage/types.js";

export type RecordingStatus = "starting" | "recording" | "ready" | "failed";

export interface CallRecordingRecord {
  id: string;
  callId: string;
  conversationId: string;
  userId: string;
  callOffsetMs: number;
  status: string;
  objectKey: string;
  contentType: string;
  format: string;
  providerEgressId: string | null;
  providerTrackSid: string;
  durationMs: number | null;
  sizeBytes: number | null;
  startedAt: Date;
  endedAt: Date | null;
  error: string | null;
}

export interface InsertStartingRecordingParams {
  id: string;
  callId: string;
  conversationId: string;
  userId: string;
  callOffsetMs: number;
  objectKey: string;
  providerTrackSid: string;
}

export async function insertStartingRecording(
  params: InsertStartingRecordingParams,
): Promise<CallRecordingRecord> {
  const [recording] = await db
    .insert(callRecordings)
    .values({
      id: params.id,
      callId: params.callId,
      conversationId: params.conversationId,
      userId: params.userId,
      callOffsetMs: params.callOffsetMs,
      status: "starting",
      objectKey: params.objectKey,
      contentType: RECORDING_CONTENT_TYPE,
      format: RECORDING_FORMAT,
      providerTrackSid: params.providerTrackSid,
    })
    .returning();

  return recording;
}

export type RecordingStartEvent =
  | {
      type: "call.recording.started";
      payload: {
        callId: string;
        userId: string;
        recordingId: string;
        objectKey: string;
        callOffsetMs: number;
      };
    }
  | {
      type: "call.recording.restored";
      payload: {
        callId: string;
        userId: string;
        recordingId: string;
        objectKey: string;
        callOffsetMs: number;
        previousRecordingId: string;
      };
    };

export async function markRecordingActive(
  recordingId: string,
  egressId: string,
  actorId: string,
  event: RecordingStartEvent,
): Promise<CallRecordingRecord | null> {
  return db.transaction(async (tx) => {
    const [recording] = await tx
      .update(callRecordings)
      .set({
        status: "recording",
        providerEgressId: egressId,
      })
      .where(
        and(
          eq(callRecordings.id, recordingId),
          inArray(callRecordings.status, ["starting", "recording"]),
        ),
      )
      .returning();

    if (!recording) {
      return null;
    }

    await tx.insert(outboxEvents).values({
      type: event.type,
      aggregateType: "call_recording",
      aggregateId: recording.id,
      conversationId: recording.conversationId,
      actorId,
      payload: event.payload,
    });

    return recording;
  });
}

export async function markRecordingCompleted(
  recordingId: string,
  details: {
    durationMs: number;
    sizeBytes: number;
    actorId: string;
  },
): Promise<CallRecordingRecord | null> {
  return db.transaction(async (tx) => {
    const [recording] = await tx
      .update(callRecordings)
      .set({
        status: "ready",
        durationMs: details.durationMs,
        sizeBytes: details.sizeBytes,
        endedAt: new Date(),
        error: null,
      })
      .where(
        and(
          eq(callRecordings.id, recordingId),
          inArray(callRecordings.status, ["starting", "recording"]),
        ),
      )
      .returning();

    if (!recording) {
      return null;
    }

    await tx.insert(outboxEvents).values({
      type: "call.recording.completed",
      aggregateType: "call_recording",
      aggregateId: recording.id,
      conversationId: recording.conversationId,
      actorId: details.actorId,
      payload: {
        callId: recording.callId,
        userId: recording.userId,
        recordingId: recording.id,
        objectKey: recording.objectKey,
        callOffsetMs: recording.callOffsetMs,
        durationMs: details.durationMs,
      },
    });

    return recording;
  });
}

export async function markRecordingFailed(
  recordingId: string,
  error: string,
  actorId: string,
): Promise<CallRecordingRecord | null> {
  return db.transaction(async (tx) => {
    const [recording] = await tx
      .update(callRecordings)
      .set({
        status: "failed",
        error,
        endedAt: new Date(),
      })
      .where(
        and(
          eq(callRecordings.id, recordingId),
          inArray(callRecordings.status, ["starting", "recording"]),
        ),
      )
      .returning();

    if (!recording) {
      return null;
    }

    await tx.insert(outboxEvents).values({
      type: "call.recording.failed",
      aggregateType: "call_recording",
      aggregateId: recording.id,
      conversationId: recording.conversationId,
      actorId,
      payload: {
        callId: recording.callId,
        userId: recording.userId,
        recordingId: recording.id,
        error,
      },
    });

    return recording;
  });
}

export async function getRecordingById(
  recordingId: string,
): Promise<CallRecordingRecord | null> {
  const [recording] = await db
    .select()
    .from(callRecordings)
    .where(eq(callRecordings.id, recordingId))
    .limit(1);

  return recording ?? null;
}

export async function getRecordingByEgressId(
  egressId: string,
): Promise<CallRecordingRecord | null> {
  const [recording] = await db
    .select()
    .from(callRecordings)
    .where(eq(callRecordings.providerEgressId, egressId))
    .limit(1);

  return recording ?? null;
}

export async function getActiveRecordingForTrack(
  callId: string,
  trackSid: string,
): Promise<CallRecordingRecord | null> {
  const [recording] = await db
    .select()
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.callId, callId),
        eq(callRecordings.providerTrackSid, trackSid),
        inArray(callRecordings.status, ["starting", "recording"]),
      ),
    )
    .limit(1);

  return recording ?? null;
}

export async function getLatestFailedRecordingForTrack(
  callId: string,
  trackSid: string,
): Promise<CallRecordingRecord | null> {
  const [recording] = await db
    .select()
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.callId, callId),
        eq(callRecordings.providerTrackSid, trackSid),
        eq(callRecordings.status, "failed"),
      ),
    )
    .orderBy(desc(callRecordings.startedAt))
    .limit(1);

  return recording ?? null;
}

export async function listRecordingsForCall(
  callId: string,
): Promise<CallRecordingRecord[]> {
  return db
    .select()
    .from(callRecordings)
    .where(eq(callRecordings.callId, callId))
    .orderBy(asc(callRecordings.callOffsetMs), asc(callRecordings.startedAt));
}

export async function listActiveRecordingsForCall(
  callId: string,
): Promise<CallRecordingRecord[]> {
  return db
    .select()
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.callId, callId),
        inArray(callRecordings.status, ["starting", "recording"]),
      ),
    );
}

export async function listStuckStartingRecordings(
  olderThan: Date,
): Promise<CallRecordingRecord[]> {
  return db
    .select()
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.status, "starting"),
        sql`${callRecordings.startedAt} < ${olderThan}`,
      ),
    );
}

export interface CallListItem {
  id: string;
  conversationId: string;
  startedBy: string;
  status: string;
  mediaMode: string;
  startedAt: Date;
  endedAt: Date | null;
}

export async function listCallsForConversation(
  conversationId: string,
): Promise<CallListItem[]> {
  return db
    .select({
      id: calls.id,
      conversationId: calls.conversationId,
      startedBy: calls.startedBy,
      status: calls.status,
      mediaMode: calls.mediaMode,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
    })
    .from(calls)
    .where(eq(calls.conversationId, conversationId))
    .orderBy(desc(calls.startedAt));
}

export async function getCallForConversation(
  conversationId: string,
  callId: string,
): Promise<CallListItem | null> {
  const [call] = await db
    .select({
      id: calls.id,
      conversationId: calls.conversationId,
      startedBy: calls.startedBy,
      status: calls.status,
      mediaMode: calls.mediaMode,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
    })
    .from(calls)
    .where(and(eq(calls.id, callId), eq(calls.conversationId, conversationId)))
    .limit(1);

  return call ?? null;
}
