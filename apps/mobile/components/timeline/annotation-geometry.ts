import {
  MINIMAP_THICKNESS,
  trackIndexFromAcross,
} from './timeline-layout';
import { SELECTION_MIN_WIDTH_MS } from './timeline-snap';
import type { ChannelScope, TimelineTrack } from './timeline-model';

export const POINT_PAD_MS = 400;

export type AnnotationHitTarget = {
  id: string;
  startMs: number;
  endMs: number;
  trackIndex: number;
  isPoint: number;
  editable: number;
};

export function annotationTrackIndex(
  scope: ChannelScope,
  tracks: TimelineTrack[],
): number {
  if (scope.kind !== 'channel') {
    return -1;
  }
  return tracks.findIndex((track) => track.userId === scope.userId);
}

export function hitAnnotationIndex(
  hits: AnnotationHitTarget[],
  atMs: number,
  across: number,
  rulerCross: number,
  trackBreadth: number,
): number {
  'worklet';
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    if (!hit) {
      continue;
    }
    const pad = hit.isPoint ? POINT_PAD_MS : 0;
    const start = hit.startMs - pad / 2;
    const end = (hit.isPoint ? hit.startMs : hit.endMs) + pad / 2;
    if (atMs < start || atMs > end) {
      continue;
    }
    if (hit.trackIndex < 0) {
      return index;
    }
    const startAcross =
      rulerCross + MINIMAP_THICKNESS + hit.trackIndex * trackBreadth;
    if (across >= startAcross && across <= startAcross + trackBreadth) {
      return index;
    }
  }
  return -1;
}

export function annotationPanMode(
  last: { startMs: number; endMs: number; trackIndex: number },
  along: number,
  across: number,
  viewStartMs: number,
  msPerPixel: number,
  timeGutter: number,
  rulerCross: number,
  trackBreadth: number,
  tracksCrossPx: number,
  handleHitPx: number,
): number {
  'worklet';
  if (last.startMs < 0) {
    return 0;
  }
  const isPoint = last.endMs <= last.startMs;
  const pad = isPoint ? POINT_PAD_MS : 0;
  const visualStart = last.startMs - pad / 2;
  const visualEnd = (isPoint ? last.startMs : last.endMs) + pad / 2;
  const alongStart = timeGutter + (visualStart - viewStartMs) / msPerPixel;
  const alongEnd = timeGutter + (visualEnd - viewStartMs) / msPerPixel;
  const handleCrossStart =
    last.trackIndex >= 0
      ? rulerCross + MINIMAP_THICKNESS + last.trackIndex * trackBreadth
      : 0;
  const handleCrossEnd =
    last.trackIndex >= 0
      ? handleCrossStart + trackBreadth
      : rulerCross + MINIMAP_THICKNESS + tracksCrossPx;
  if (across < handleCrossStart || across > handleCrossEnd) {
    return 0;
  }
  if (along < alongStart - handleHitPx || along > alongEnd + handleHitPx) {
    return 0;
  }
  if (Math.abs(along - alongStart) <= handleHitPx) {
    return 5;
  }
  if (Math.abs(along - alongEnd) <= handleHitPx) {
    return 6;
  }
  if (along >= alongStart && along <= alongEnd) {
    return 4;
  }
  return 0;
}

export function applyAnnotationPan(
  origin: {
    mode: number;
    startMs: number;
    endMs: number;
    viewStartMs: number;
    msPerPixel: number;
    trackIndex: number;
  },
  along: number,
  across: number,
  translationAlong: number,
  timeGutter: number,
  durationMs: number,
  rulerCross: number,
  trackBreadth: number,
  trackCount: number,
): { startMs: number; endMs: number; trackIndex: number } {
  'worklet';
  const atMs =
    origin.viewStartMs +
    Math.max(0, along - timeGutter) * origin.msPerPixel;
  let nextStartMs = origin.startMs;
  let nextEndMs = origin.endMs;
  let trackIndex = origin.trackIndex;

  if (origin.mode === 4) {
    const deltaMs = translationAlong * origin.msPerPixel;
    const width = Math.max(0, origin.endMs - origin.startMs);
    nextStartMs = origin.startMs + deltaMs;
    nextEndMs = origin.endMs + deltaMs;
    if (nextStartMs < 0) {
      nextStartMs = 0;
      nextEndMs = width;
    }
    if (nextEndMs > durationMs) {
      nextEndMs = durationMs;
      nextStartMs = Math.max(0, durationMs - width);
    }
    trackIndex = trackIndexFromAcross(
      across,
      rulerCross,
      trackBreadth,
      trackCount,
    );
  } else if (origin.mode === 5) {
    nextEndMs = origin.endMs;
    nextStartMs = Math.max(
      0,
      Math.min(atMs, origin.endMs - SELECTION_MIN_WIDTH_MS),
    );
  } else if (origin.mode === 6) {
    nextStartMs = origin.startMs;
    nextEndMs = Math.min(
      durationMs,
      Math.max(atMs, origin.startMs + SELECTION_MIN_WIDTH_MS),
    );
  }

  return { startMs: nextStartMs, endMs: nextEndMs, trackIndex };
}
