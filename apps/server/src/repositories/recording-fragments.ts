import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../database.js";
import { callRecordingFragments } from "../db/schema.js";

export interface RecordingFragmentRecord {
  id: string;
  recordingId: string;
  callId: string;
  userId: string;
  callOffsetMs: number;
  durationMs: number;
  objectKey: string;
  sizeBytes: number;
}

export async function insertRecordingFragment(params: {
  id?: string;
  recordingId: string;
  callId: string;
  userId: string;
  callOffsetMs: number;
  durationMs: number;
  objectKey: string;
  sizeBytes: number;
}): Promise<RecordingFragmentRecord> {
  const [fragment] = await db
    .insert(callRecordingFragments)
    .values({
      id: params.id,
      recordingId: params.recordingId,
      callId: params.callId,
      userId: params.userId,
      callOffsetMs: params.callOffsetMs,
      durationMs: params.durationMs,
      objectKey: params.objectKey,
      sizeBytes: params.sizeBytes,
    })
    .returning();

  return fragment;
}

export async function listFragmentsForCall(
  callId: string,
): Promise<RecordingFragmentRecord[]> {
  return db
    .select()
    .from(callRecordingFragments)
    .where(eq(callRecordingFragments.callId, callId))
    .orderBy(
      asc(callRecordingFragments.callOffsetMs),
      asc(callRecordingFragments.recordingId),
    );
}

export async function listFragmentsForRecording(
  recordingId: string,
): Promise<RecordingFragmentRecord[]> {
  return db
    .select()
    .from(callRecordingFragments)
    .where(eq(callRecordingFragments.recordingId, recordingId))
    .orderBy(asc(callRecordingFragments.callOffsetMs));
}

export async function sumFragmentStats(recordingId: string): Promise<{
  durationMs: number;
  sizeBytes: number;
}> {
  const [row] = await db
    .select({
      durationMs: sql<number>`coalesce(sum(${callRecordingFragments.durationMs}), 0)`,
      sizeBytes: sql<number>`coalesce(sum(${callRecordingFragments.sizeBytes}), 0)`,
    })
    .from(callRecordingFragments)
    .where(eq(callRecordingFragments.recordingId, recordingId));

  return {
    durationMs: Number(row?.durationMs ?? 0),
    sizeBytes: Number(row?.sizeBytes ?? 0),
  };
}

export async function getFragmentById(
  fragmentId: string,
): Promise<RecordingFragmentRecord | null> {
  const [fragment] = await db
    .select()
    .from(callRecordingFragments)
    .where(and(eq(callRecordingFragments.id, fragmentId)))
    .limit(1);

  return fragment ?? null;
}
