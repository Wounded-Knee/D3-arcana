import {
  WAVEFORM_CHUNK_DURATION_MS,
  WAVEFORM_SAMPLE_INTERVAL_MS,
  chunkStartForOffset,
} from '@/lib/call/waveform-sampler';

export type TimelineSession = {
  joinedAt: string;
  leftAt: string | null;
};

export type TimelineChunk = {
  startOffsetMs: number;
  amplitudes: number[];
};

export type TimelineTrack = {
  userId: string;
  displayName: string;
  sessions: TimelineSession[];
  chunks: TimelineChunk[];
};

function mergeChunk(
  existing: number[] | undefined,
  incoming: number[],
): number[] {
  if (!existing || existing.length === 0) {
    return incoming.slice();
  }

  const length = Math.max(existing.length, incoming.length);
  const merged = existing.slice();
  while (merged.length < length) {
    merged.push(0);
  }

  for (let i = 0; i < incoming.length; i += 1) {
    merged[i] = incoming[i]!;
  }

  return merged;
}

export function upsertTrackChunk(
  tracks: TimelineTrack[],
  userId: string,
  displayName: string,
  startOffsetMs: number,
  amplitudes: number[],
): TimelineTrack[] {
  const index = tracks.findIndex((track) => track.userId === userId);

  if (index === -1) {
    return [
      ...tracks,
      {
        userId,
        displayName,
        sessions: [],
        chunks: [{ startOffsetMs, amplitudes: amplitudes.slice() }],
      },
    ];
  }

  return tracks.map((track, trackIndex) => {
    if (trackIndex !== index) {
      return track;
    }

    const chunkIndex = track.chunks.findIndex(
      (chunk) => chunk.startOffsetMs === startOffsetMs,
    );
    const nextChunks = [...track.chunks];

    if (chunkIndex === -1) {
      nextChunks.push({ startOffsetMs, amplitudes: amplitudes.slice() });
      nextChunks.sort((left, right) => left.startOffsetMs - right.startOffsetMs);
    } else {
      nextChunks[chunkIndex] = {
        startOffsetMs,
        amplitudes: mergeChunk(nextChunks[chunkIndex]?.amplitudes, amplitudes),
      };
    }

    return {
      ...track,
      displayName: track.displayName || displayName,
      chunks: nextChunks,
    };
  });
}

export function applyOptimisticSample(
  tracks: TimelineTrack[],
  userId: string,
  displayName: string,
  offsetMs: number,
  amplitude: number,
): TimelineTrack[] {
  const startOffsetMs = chunkStartForOffset(offsetMs);
  const sampleIndex = Math.floor(
    (offsetMs - startOffsetMs) / WAVEFORM_SAMPLE_INTERVAL_MS,
  );
  const existing = tracks.find((track) => track.userId === userId);
  const current =
    existing?.chunks.find((chunk) => chunk.startOffsetMs === startOffsetMs)
      ?.amplitudes ?? [];
  const next = current.slice();
  while (next.length <= sampleIndex) {
    next.push(0);
  }
  next[sampleIndex] = Math.max(next[sampleIndex] ?? 0, amplitude);

  return upsertTrackChunk(tracks, userId, displayName, startOffsetMs, next);
}

export function applyParticipantJoined(
  tracks: TimelineTrack[],
  userId: string,
  displayName: string,
  joinedAt: string,
): TimelineTrack[] {
  const existing = tracks.find((track) => track.userId === userId);

  if (!existing) {
    return [
      ...tracks,
      {
        userId,
        displayName,
        sessions: [{ joinedAt, leftAt: null }],
        chunks: [],
      },
    ];
  }

  if (existing.sessions.some((session) => session.leftAt === null)) {
    return tracks;
  }

  return tracks.map((track) =>
    track.userId === userId
      ? {
          ...track,
          displayName: track.displayName || displayName,
          sessions: [...track.sessions, { joinedAt, leftAt: null }],
        }
      : track,
  );
}

export function applyParticipantLeft(
  tracks: TimelineTrack[],
  userId: string,
  leftAt: string,
): TimelineTrack[] {
  return tracks.map((track) => {
    if (track.userId !== userId) {
      return track;
    }

    return {
      ...track,
      sessions: track.sessions.map((session) =>
        session.leftAt === null ? { ...session, leftAt } : session,
      ),
    };
  });
}

export type SessionRange = {
  startMs: number;
  endMs: number;
};

export function sessionRanges(
  sessions: TimelineSession[],
  callStartedAtMs: number,
): SessionRange[] {
  return sessions.map((session) => ({
    startMs: Date.parse(session.joinedAt) - callStartedAtMs,
    endMs: session.leftAt
      ? Date.parse(session.leftAt) - callStartedAtMs
      : Number.POSITIVE_INFINITY,
  }));
}

export function isInSessionRanges(
  ranges: SessionRange[],
  offsetMs: number,
): boolean {
  if (ranges.length === 0) {
    return true;
  }

  return ranges.some(
    (range) => offsetMs >= range.startMs && offsetMs < range.endMs,
  );
}

export type ChunkIndex = Map<number, number[]>;

export function indexChunks(chunks: TimelineChunk[]): ChunkIndex {
  const index: ChunkIndex = new Map();
  for (const chunk of chunks) {
    index.set(chunk.startOffsetMs, chunk.amplitudes);
  }
  return index;
}

export function amplitudeAt(
  chunks: TimelineChunk[],
  offsetMs: number,
): number {
  return amplitudeAtIndexed(indexChunks(chunks), offsetMs);
}

export function amplitudeAtIndexed(
  index: ChunkIndex,
  offsetMs: number,
): number {
  const startOffsetMs = chunkStartForOffset(offsetMs);
  const amplitudes = index.get(startOffsetMs);
  if (!amplitudes) {
    return 0;
  }

  const sampleIndex = Math.floor(
    (offsetMs - startOffsetMs) / WAVEFORM_SAMPLE_INTERVAL_MS,
  );
  return amplitudes[sampleIndex] ?? 0;
}

export function maxAmplitudeInRange(
  chunks: TimelineChunk[],
  startMs: number,
  endMs: number,
): number {
  return maxAmplitudeInRangeIndexed(indexChunks(chunks), startMs, endMs);
}

export function maxAmplitudeInRangeIndexed(
  index: ChunkIndex,
  startMs: number,
  endMs: number,
): number {
  if (endMs <= startMs) {
    return 0;
  }

  let max = 0;
  const firstChunk = chunkStartForOffset(Math.max(0, startMs));
  const lastChunk = chunkStartForOffset(Math.max(0, endMs - 1));

  for (
    let chunkStart = firstChunk;
    chunkStart <= lastChunk;
    chunkStart += WAVEFORM_CHUNK_DURATION_MS
  ) {
    const amplitudes = index.get(chunkStart);
    if (!amplitudes || amplitudes.length === 0) {
      continue;
    }

    const rangeStart = Math.max(startMs, chunkStart);
    const rangeEnd = Math.min(endMs, chunkStart + WAVEFORM_CHUNK_DURATION_MS);
    let sampleIndex = Math.floor(
      (rangeStart - chunkStart) / WAVEFORM_SAMPLE_INTERVAL_MS,
    );
    const lastIndex = Math.min(
      amplitudes.length - 1,
      Math.floor((rangeEnd - 1 - chunkStart) / WAVEFORM_SAMPLE_INTERVAL_MS),
    );

    for (; sampleIndex <= lastIndex; sampleIndex += 1) {
      const value = amplitudes[sampleIndex] ?? 0;
      if (value > max) {
        max = value;
      }
      if (max === 255) {
        return 255;
      }
    }
  }

  return max;
}
