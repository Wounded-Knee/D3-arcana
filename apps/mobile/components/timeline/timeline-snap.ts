import { WAVEFORM_SAMPLE_INTERVAL_MS } from '@/lib/call/waveform-sampler';

import { amplitudeAt, type ChannelScope, type TimelineTrack } from './timeline-model';

export const SNAP_WINDOW_MS = 400;
export const SPEECH_FLOOR = 24;
export const SPEECH_PEAK_FRACTION = 0.25;
export const SELECTION_MIN_WIDTH_MS = 50;

export type SpeechEdge = 'onset' | 'offset';

function trackPeak(track: TimelineTrack): number {
  let peak = 0;
  for (const chunk of track.chunks) {
    for (const value of chunk.amplitudes) {
      if (value > peak) {
        peak = value;
      }
    }
  }
  return peak;
}

export function speechThreshold(track: TimelineTrack): number {
  return Math.max(SPEECH_FLOOR, Math.round(trackPeak(track) * SPEECH_PEAK_FRACTION));
}

function isSpeech(value: number, threshold: number): boolean {
  return value >= threshold;
}

function nearestBoundary(
  track: TimelineTrack,
  edgeMs: number,
  kind: SpeechEdge,
  windowMs: number,
): number | null {
  const threshold = speechThreshold(track);
  const fromMs = Math.max(0, edgeMs - windowMs);
  const toMs = edgeMs + windowMs;
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  const first = Math.floor(fromMs / WAVEFORM_SAMPLE_INTERVAL_MS) * WAVEFORM_SAMPLE_INTERVAL_MS;

  for (
    let offsetMs = first;
    offsetMs <= toMs;
    offsetMs += WAVEFORM_SAMPLE_INTERVAL_MS
  ) {
    const previous = amplitudeAt(
      track.chunks,
      Math.max(0, offsetMs - WAVEFORM_SAMPLE_INTERVAL_MS),
    );
    const current = amplitudeAt(track.chunks, offsetMs);
    const prevSpeech = isSpeech(previous, threshold);
    const currentSpeech = isSpeech(current, threshold);
    const matches =
      kind === 'onset' ? !prevSpeech && currentSpeech : prevSpeech && !currentSpeech;

    if (!matches) {
      continue;
    }

    const distance = Math.abs(offsetMs - edgeMs);
    if (distance < bestDistance) {
      best = offsetMs;
      bestDistance = distance;
    }
  }

  return best;
}

function scopedTracks(
  tracks: TimelineTrack[],
  scope: ChannelScope,
): TimelineTrack[] {
  if (scope.kind === 'all') {
    return tracks;
  }

  return tracks.filter((track) => track.userId === scope.userId);
}

export function snapEdgeToSpeech(
  tracks: TimelineTrack[],
  scope: ChannelScope,
  edgeMs: number,
  kind: SpeechEdge,
  windowMs = SNAP_WINDOW_MS,
): number {
  let best = edgeMs;
  let bestDistance = windowMs + 1;

  for (const track of scopedTracks(tracks, scope)) {
    const snapped = nearestBoundary(track, edgeMs, kind, windowMs);
    if (snapped === null) {
      continue;
    }

    const distance = Math.abs(snapped - edgeMs);
    if (distance < bestDistance) {
      best = snapped;
      bestDistance = distance;
    }
  }

  return best;
}

export function snapSelectionEdges(
  tracks: TimelineTrack[],
  scope: ChannelScope,
  startMs: number,
  endMs: number,
  moved: 'start' | 'end' | 'both',
  durationMs: number,
): { startMs: number; endMs: number } {
  let nextStart = startMs;
  let nextEnd = endMs;

  if (moved === 'start' || moved === 'both') {
    nextStart = snapEdgeToSpeech(tracks, scope, startMs, 'onset');
  }
  if (moved === 'end' || moved === 'both') {
    nextEnd = snapEdgeToSpeech(tracks, scope, endMs, 'offset');
  }

  nextStart = Math.max(0, Math.min(nextStart, durationMs));
  nextEnd = Math.max(0, Math.min(nextEnd, durationMs));
  nextStart = Math.round(nextStart);
  nextEnd = Math.round(nextEnd);

  if (nextEnd < nextStart + SELECTION_MIN_WIDTH_MS) {
    if (moved === 'start') {
      nextStart = Math.max(0, nextEnd - SELECTION_MIN_WIDTH_MS);
    } else {
      nextEnd = Math.min(durationMs, nextStart + SELECTION_MIN_WIDTH_MS);
    }
  }

  return { startMs: nextStart, endMs: nextEnd };
}
