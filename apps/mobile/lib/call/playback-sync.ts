import type { RecordingSegment } from './playback-types';

export const PREFETCH_AHEAD_MS = 4_000;
export const START_SEEK_SEC = 0.08;
export const PLAYING_DRIFT_SEEK_SEC = 1.25;

export function shouldSeekAudio(
  currentTime: number,
  targetSec: number,
  isPlaying: boolean,
): boolean {
  if (!Number.isFinite(currentTime)) {
    return true;
  }

  const drift = Math.abs(currentTime - targetSec);
  return isPlaying ? drift > PLAYING_DRIFT_SEEK_SEC : drift > START_SEEK_SEC;
}

export function isUpcomingSegment(
  playheadMs: number,
  callOffsetMs: number,
  durationMs: number,
): boolean {
  if (durationMs <= 0) {
    return false;
  }

  return (
    callOffsetMs > playheadMs && callOffsetMs <= playheadMs + PREFETCH_AHEAD_MS
  );
}

export function groupSegmentsByRecording(
  segments: RecordingSegment[],
): Map<string, RecordingSegment[]> {
  const groups = new Map<string, RecordingSegment[]>();
  for (const segment of segments) {
    const key = segment.recordingId ?? segment.id;
    const group = groups.get(key);
    if (group) {
      group.push(segment);
    } else {
      groups.set(key, [segment]);
    }
  }

  for (const group of groups.values()) {
    group.sort((a, b) => a.callOffsetMs - b.callOffsetMs);
  }

  return groups;
}

export function withLiveTail(
  prepared: RecordingSegment[],
  fragments: RecordingSegment[],
): RecordingSegment[] {
  if (prepared.length === 0) {
    return fragments;
  }

  const preparedIds = new Set(prepared.map((item) => item.id));
  const tail = fragments.filter((fragment) => {
    if (preparedIds.has(fragment.id)) {
      return false;
    }

    return !prepared.some(
      (run) =>
        run.userId === fragment.userId &&
        fragment.callOffsetMs >= run.callOffsetMs &&
        fragment.callOffsetMs + fragment.durationMs <=
          run.callOffsetMs + run.durationMs + 25,
    );
  });

  return [...prepared, ...tail];
}
