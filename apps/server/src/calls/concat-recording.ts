import { listFragmentsForRecording } from "../repositories/recording-fragments.js";
import { getRecordingById } from "../repositories/recordings.js";
import { getObjectStore } from "../storage/object-store-instance.js";
import {
  FRAGMENT_CONTENT_TYPE,
  PLAYBACK_URL_TTL_SECONDS,
} from "../storage/types.js";
import { concatTimedWavs, pcmDurationMs, extractWavPcm } from "../storage/wav.js";

export type RecordingMedia = {
  recordingId: string;
  userId: string;
  callOffsetMs: number;
  durationMs: number;
  playbackUrl: string;
};

export function mediaObjectKey(
  sessionPrefix: string,
  fragmentCount: number,
  lastOffsetMs: number,
): string {
  return `${sessionPrefix}/media/${fragmentCount}-${lastOffsetMs}.wav`;
}

export async function buildRecordingMedia(
  recordingId: string,
  callId?: string,
): Promise<RecordingMedia | null> {
  const recording = await getRecordingById(recordingId);
  if (!recording) {
    return null;
  }
  if (callId && recording.callId !== callId) {
    return null;
  }

  const fragments = await listFragmentsForRecording(recordingId);
  if (fragments.length === 0) {
    return null;
  }

  const last = fragments[fragments.length - 1]!;
  const callOffsetMs = fragments[0]!.callOffsetMs;
  let durationMs = last.callOffsetMs + last.durationMs - callOffsetMs;
  const key = mediaObjectKey(
    recording.objectKey,
    fragments.length,
    last.callOffsetMs,
  );
  const store = getObjectStore();

  if (!(await store.exists(key))) {
    const loaded = await Promise.all(
      fragments.map(async (fragment) => {
        const wav = await store.get(fragment.objectKey);
        return wav ? { wav, callOffsetMs: fragment.callOffsetMs } : null;
      }),
    );
    const clips = loaded.filter(
      (clip): clip is { wav: Buffer; callOffsetMs: number } => clip !== null,
    );

    if (clips.length === 0) {
      return null;
    }

    const wav = concatTimedWavs(clips);
    durationMs = pcmDurationMs(extractWavPcm(wav));
    await store.put(key, wav, FRAGMENT_CONTENT_TYPE);
  }

  return {
    recordingId: recording.id,
    userId: recording.userId,
    callOffsetMs,
    durationMs,
    playbackUrl: await store.issueReadUrl(key, PLAYBACK_URL_TTL_SECONDS),
  };
}
