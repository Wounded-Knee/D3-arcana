import { randomUUID } from "node:crypto";

import { getMediaSessionProvider } from "../media/media-provider-instance.js";
import { getCallById, listActiveCalls } from "../repositories/calls.js";
import {
  getActiveRecordingForTrack,
  getLatestFailedRecordingForTrack,
  insertStartingRecording,
  listActiveRecordingsForCall,
  listStuckStartingRecordings,
  markRecordingActive,
  markRecordingCompleted,
  markRecordingFailed,
  type CallRecordingRecord,
  type RecordingStartEvent,
} from "../repositories/recordings.js";
import { buildEgressIngestUrl } from "../realtime/egress-ingest-config.js";
import { sumFragmentStats } from "../repositories/recording-fragments.js";
import { getObjectStore } from "../storage/object-store-instance.js";

const STARTING_STALE_MS = 30_000;
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000];
const RECONCILE_INTERVAL_MS = 15_000;

type RetryState = {
  attempt: number;
  timer: ReturnType<typeof setTimeout>;
};

const retries = new Map<string, RetryState>();
let reconcileTimer: ReturnType<typeof setInterval> | null = null;

function retryKey(callId: string, trackSid: string): string {
  return `${callId}:${trackSid}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

export function cancelRecordingRetry(callId: string, trackSid: string): void {
  const key = retryKey(callId, trackSid);
  const state = retries.get(key);
  if (!state) {
    return;
  }

  clearTimeout(state.timer);
  retries.delete(key);
}

export function cancelRecordingRetriesForCall(callId: string): void {
  const prefix = `${callId}:`;
  for (const [key, state] of retries) {
    if (key.startsWith(prefix)) {
      clearTimeout(state.timer);
      retries.delete(key);
    }
  }
}

export function resetRecordingRetriesForTests(): void {
  for (const state of retries.values()) {
    clearTimeout(state.timer);
  }

  retries.clear();

  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}

export function scheduleRecordingRetry(
  callId: string,
  trackSid: string,
  userId: string,
): void {
  const key = retryKey(callId, trackSid);
  const existing = retries.get(key);
  const attempt = existing ? existing.attempt + 1 : 0;

  if (existing) {
    clearTimeout(existing.timer);
  }

  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
  const timer = setTimeout(() => {
    retries.delete(key);
    void retryTrackRecording({ callId, trackSid, userId }).catch(
      (error: unknown) => {
        console.error(`[recording-retry] ${callId} ${trackSid}:`, error);
        scheduleRecordingRetry(callId, trackSid, userId);
      },
    );
  }, delay);

  retries.set(key, { attempt, timer });
}

export function startRecordingReconcileLoop(): () => void {
  if (reconcileTimer) {
    return stopRecordingReconcileLoop;
  }

  reconcileTimer = setInterval(() => {
    void reconcileActiveCallRecordings().catch((error: unknown) => {
      console.error("[recording-reconcile]", error);
    });
  }, RECONCILE_INTERVAL_MS);

  return stopRecordingReconcileLoop;
}

export function stopRecordingReconcileLoop(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}

export async function startTrackRecording(options: {
  callId: string;
  conversationId: string;
  userId: string;
  trackSid: string;
  callStartedAt: Date;
}): Promise<CallRecordingRecord | null> {
  const existing = await getActiveRecordingForTrack(
    options.callId,
    options.trackSid,
  );
  if (existing) {
    return existing;
  }

  const previousFailed = await getLatestFailedRecordingForTrack(
    options.callId,
    options.trackSid,
  );
  const recordingId = randomUUID();
  const callOffsetMs = Math.max(
    0,
    Date.now() - options.callStartedAt.getTime(),
  );
  const objectKey = getObjectStore().objectKeyForTrack(
    options.conversationId,
    options.callId,
    options.userId,
    options.trackSid,
    recordingId,
  );

  let recording: CallRecordingRecord;

  try {
    recording = await insertStartingRecording({
      id: recordingId,
      callId: options.callId,
      conversationId: options.conversationId,
      userId: options.userId,
      callOffsetMs,
      objectKey,
      providerTrackSid: options.trackSid,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return getActiveRecordingForTrack(options.callId, options.trackSid);
    }

    throw error;
  }

  try {
    const started = await getMediaSessionProvider().startTrackRecording({
      callId: options.callId,
      userId: options.userId,
      trackSid: options.trackSid,
      websocketUrl: buildEgressIngestUrl({
        recordingId: recording.id,
        callId: options.callId,
        trackSid: options.trackSid,
      }),
    });

    const event: RecordingStartEvent = previousFailed
      ? {
          type: "call.recording.restored",
          payload: {
            callId: options.callId,
            userId: options.userId,
            recordingId: recording.id,
            objectKey,
            callOffsetMs,
            previousRecordingId: previousFailed.id,
          },
        }
      : {
          type: "call.recording.started",
          payload: {
            callId: options.callId,
            userId: options.userId,
            recordingId: recording.id,
            objectKey,
            callOffsetMs,
          },
        };

    const active = await markRecordingActive(
      recording.id,
      started.egressId,
      options.userId,
      event,
    );

    cancelRecordingRetry(options.callId, options.trackSid);
    return active ?? recording;
  } catch (error) {
    const failed = await markRecordingFailed(
      recording.id,
      errorMessage(error),
      options.userId,
    );
    scheduleRecordingRetry(
      options.callId,
      options.trackSid,
      options.userId,
    );
    return failed;
  }
}

export async function completeTrackRecording(options: {
  recording: CallRecordingRecord;
  durationNs?: bigint | number | string;
  sizeBytes?: number;
  error?: string;
  success: boolean;
}): Promise<void> {
  if (options.success) {
    const stats = await sumFragmentStats(options.recording.id);
    await markRecordingCompleted(options.recording.id, {
      durationMs: stats.durationMs,
      sizeBytes: stats.sizeBytes,
      actorId: options.recording.userId,
    });
    cancelRecordingRetry(
      options.recording.callId,
      options.recording.providerTrackSid,
    );
    return;
  }

  await markRecordingFailed(
    options.recording.id,
    options.error || "egress failed",
    options.recording.userId,
  );

  const call = await getCallById(options.recording.callId);
  if (call?.status === "active") {
    scheduleRecordingRetry(
      options.recording.callId,
      options.recording.providerTrackSid,
      options.recording.userId,
    );
  } else {
    cancelRecordingRetry(
      options.recording.callId,
      options.recording.providerTrackSid,
    );
  }
}

export async function retryTrackRecording(options: {
  callId: string;
  trackSid: string;
  userId: string;
}): Promise<void> {
  const call = await getCallById(options.callId);
  if (!call || call.status !== "active") {
    cancelRecordingRetry(options.callId, options.trackSid);
    return;
  }

  const published = await getMediaSessionProvider().listPublishedAudioTracks(
    options.callId,
  );
  const stillPublished = published.some(
    (track) =>
      track.trackSid === options.trackSid && track.userId === options.userId,
  );

  if (!stillPublished) {
    cancelRecordingRetry(options.callId, options.trackSid);
    return;
  }

  await startTrackRecording({
    callId: options.callId,
    conversationId: call.conversationId,
    userId: options.userId,
    trackSid: options.trackSid,
    callStartedAt: call.startedAt,
  });
}

export async function reconcileCallRecordings(callId: string): Promise<void> {
  const call = await getCallById(callId);
  if (!call || call.status !== "active") {
    cancelRecordingRetriesForCall(callId);
    return;
  }

  const published = await getMediaSessionProvider().listPublishedAudioTracks(
    callId,
  );

  for (const track of published) {
    const active = await getActiveRecordingForTrack(callId, track.trackSid);
    if (active) {
      continue;
    }

    await startTrackRecording({
      callId,
      conversationId: call.conversationId,
      userId: track.userId,
      trackSid: track.trackSid,
      callStartedAt: call.startedAt,
    });
  }
}

export async function reconcileActiveCallRecordings(): Promise<void> {
  await failStaleStartingRecordings();
  const activeCalls = await listActiveCalls();
  for (const call of activeCalls) {
    await reconcileCallRecordings(call.id);
  }
}

export async function failStaleStartingRecordings(): Promise<void> {
  const stale = await listStuckStartingRecordings(
    new Date(Date.now() - STARTING_STALE_MS),
  );

  for (const recording of stale) {
    await markRecordingFailed(
      recording.id,
      "timed out while starting",
      recording.userId,
    );

    const call = await getCallById(recording.callId);
    if (call?.status === "active") {
      scheduleRecordingRetry(
        recording.callId,
        recording.providerTrackSid,
        recording.userId,
      );
    }
  }
}

export async function stopTrackRecording(
  callId: string,
  trackSid: string,
): Promise<void> {
  cancelRecordingRetry(callId, trackSid);
  const active = await getActiveRecordingForTrack(callId, trackSid);
  if (!active?.providerEgressId) {
    return;
  }

  try {
    await getMediaSessionProvider().stopTrackRecording(active.providerEgressId);
  } catch (error) {
    console.error(
      `[recording] failed to stop egress ${active.providerEgressId}:`,
      error,
    );
  }
}

export async function stopCallRecordings(callId: string): Promise<void> {
  cancelRecordingRetriesForCall(callId);

  const active = await listActiveRecordingsForCall(callId);
  const provider = getMediaSessionProvider();

  try {
    await provider.stopRecordingsForCall(callId);
  } catch (error) {
    console.error(
      `[recording] failed to stop egress for call ${callId}:`,
      error,
    );
  }

  for (const recording of active) {
    if (recording.providerEgressId) {
      try {
        await provider.stopTrackRecording(recording.providerEgressId);
      } catch {
        // stopRecordingsForCall already attempted the room's egress list
      }
    }
  }
}
