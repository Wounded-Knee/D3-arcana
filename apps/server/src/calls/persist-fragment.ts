import type { CallRecordingRecord } from "../repositories/recordings.js";
import { insertRecordingFragment } from "../repositories/recording-fragments.js";
import { getObjectStore } from "../storage/object-store-instance.js";
import {
  FRAGMENT_CONTENT_TYPE,
  PLAYBACK_URL_TTL_SECONDS,
} from "../storage/types.js";
import { encodeWavPcm16le, pcmDurationMs } from "../storage/wav.js";
import type { WebSocketManager } from "../realtime/websocket-manager.js";

export async function persistPcmFragment(options: {
  recording: CallRecordingRecord;
  pcm: Buffer;
  callOffsetMs: number;
  manager?: WebSocketManager;
}): Promise<{ durationMs: number; objectKey: string; fragmentId: string }> {
  const durationMs = pcmDurationMs(options.pcm);
  const wav = encodeWavPcm16le(options.pcm);
  const store = getObjectStore();
  const objectKey = store.objectKeyForFragment(
    options.recording.objectKey,
    options.callOffsetMs,
  );

  await store.put(objectKey, wav, FRAGMENT_CONTENT_TYPE);
  const fragment = await insertRecordingFragment({
    recordingId: options.recording.id,
    callId: options.recording.callId,
    userId: options.recording.userId,
    callOffsetMs: options.callOffsetMs,
    durationMs,
    objectKey,
    sizeBytes: wav.length,
  });

  if (options.manager) {
    const playbackUrl = await store.issueReadUrl(
      objectKey,
      PLAYBACK_URL_TTL_SECONDS,
    );
    options.manager.broadcastToConversation(options.recording.conversationId, {
      type: "call.recording.fragment",
      conversationId: options.recording.conversationId,
      callId: options.recording.callId,
      userId: options.recording.userId,
      fragmentId: fragment.id,
      callOffsetMs: fragment.callOffsetMs,
      durationMs: fragment.durationMs,
      playbackUrl,
    });
  }

  return { durationMs, objectKey, fragmentId: fragment.id };
}
