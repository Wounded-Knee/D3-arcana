import { and, asc, eq, inArray } from "drizzle-orm";

import {
  WAVEFORM_SAMPLE_RATE_HZ,
  amplitudesToArray,
  mergeAmplitudes,
  samplesToChunkPatches,
  type WaveformChunkPatch,
} from "../calls/waveform.js";
import { db } from "../database.js";
import { callWaveformChunks, users } from "../db/schema.js";
import {
  listCallParticipantSessions,
  type CallParticipantSessionRecord,
} from "./calls.js";

export interface WaveformChunkRecord {
  callId: string;
  userId: string;
  startOffsetMs: number;
  sampleRateHz: number;
  amplitudes: number[];
}

export interface TimelineSession {
  joinedAt: Date;
  leftAt: Date | null;
}

export interface TimelineTrack {
  userId: string;
  displayName: string;
  sessions: TimelineSession[];
  chunks: WaveformChunkRecord[];
}

export async function upsertWaveformSamples(
  callId: string,
  userId: string,
  startOffsetMs: number,
  amplitudes: number[],
): Promise<WaveformChunkRecord[]> {
  const patches = samplesToChunkPatches(startOffsetMs, amplitudes);
  if (patches.length === 0) {
    return [];
  }

  return db.transaction(async (tx) => {
    const mergedChunks: WaveformChunkRecord[] = [];

    for (const patch of patches) {
      const chunk = await upsertChunkPatch(tx, callId, userId, patch);
      mergedChunks.push(chunk);
    }

    return mergedChunks;
  });
}

async function upsertChunkPatch(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  callId: string,
  userId: string,
  patch: WaveformChunkPatch,
): Promise<WaveformChunkRecord> {
  const [existing] = await tx
    .select()
    .from(callWaveformChunks)
    .where(
      and(
        eq(callWaveformChunks.callId, callId),
        eq(callWaveformChunks.userId, userId),
        eq(callWaveformChunks.startOffsetMs, patch.startOffsetMs),
      ),
    )
    .limit(1);

  const merged = mergeAmplitudes(existing?.amplitudes ?? null, patch.writes);

  if (existing) {
    await tx
      .update(callWaveformChunks)
      .set({
        amplitudes: merged,
        sampleRateHz: WAVEFORM_SAMPLE_RATE_HZ,
      })
      .where(
        and(
          eq(callWaveformChunks.callId, callId),
          eq(callWaveformChunks.userId, userId),
          eq(callWaveformChunks.startOffsetMs, patch.startOffsetMs),
        ),
      );
  } else {
    await tx.insert(callWaveformChunks).values({
      callId,
      userId,
      startOffsetMs: patch.startOffsetMs,
      sampleRateHz: WAVEFORM_SAMPLE_RATE_HZ,
      amplitudes: merged,
    });
  }

  return {
    callId,
    userId,
    startOffsetMs: patch.startOffsetMs,
    sampleRateHz: WAVEFORM_SAMPLE_RATE_HZ,
    amplitudes: amplitudesToArray(merged),
  };
}

export async function listWaveformChunks(
  callId: string,
): Promise<WaveformChunkRecord[]> {
  const rows = await db
    .select()
    .from(callWaveformChunks)
    .where(eq(callWaveformChunks.callId, callId))
    .orderBy(asc(callWaveformChunks.startOffsetMs));

  return rows.map((row) => ({
    callId: row.callId,
    userId: row.userId,
    startOffsetMs: row.startOffsetMs,
    sampleRateHz: row.sampleRateHz,
    amplitudes: amplitudesToArray(row.amplitudes),
  }));
}

export async function getCallTimelineTracks(
  callId: string,
): Promise<TimelineTrack[]> {
  const [sessions, chunks, names] = await Promise.all([
    listCallParticipantSessions(callId),
    listWaveformChunks(callId),
    listSessionDisplayNames(callId),
  ]);

  const tracks = new Map<string, TimelineTrack>();

  const orderedSessions = [...sessions].sort(
    (left, right) => left.joinedAt.getTime() - right.joinedAt.getTime(),
  );

  for (const session of orderedSessions) {
    const track = tracks.get(session.userId) ?? {
      userId: session.userId,
      displayName: names.get(session.userId) ?? "Participant",
      sessions: [],
      chunks: [],
    };

    track.sessions.push({
      joinedAt: session.joinedAt,
      leftAt: session.leftAt,
    });
    tracks.set(session.userId, track);
  }

  for (const chunk of chunks) {
    const track = tracks.get(chunk.userId);
    if (!track) {
      continue;
    }

    track.chunks.push(chunk);
  }

  return [...tracks.values()];
}

async function listSessionDisplayNames(
  callId: string,
): Promise<Map<string, string>> {
  const sessions: CallParticipantSessionRecord[] =
    await listCallParticipantSessions(callId);
  const userIds = [...new Set(sessions.map((session) => session.userId))];

  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  return new Map(rows.map((row) => [row.id, row.displayName]));
}
