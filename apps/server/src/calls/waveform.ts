export const WAVEFORM_SAMPLE_INTERVAL_MS = 50;
export const WAVEFORM_SAMPLE_RATE_HZ = 20;
export const WAVEFORM_CHUNK_DURATION_MS = 1000;
export const WAVEFORM_SAMPLES_PER_CHUNK = 20;
export const WAVEFORM_MAX_AMPLITUDES_PER_POST = 20;
export const WAVEFORM_MAX_OFFSET_MS = 24 * 60 * 60 * 1000;

export type WaveformSampleWrite = {
  index: number;
  value: number;
};

export type WaveformChunkPatch = {
  startOffsetMs: number;
  writes: WaveformSampleWrite[];
};

export function alignOffsetMs(offsetMs: number): number {
  if (!Number.isFinite(offsetMs) || offsetMs < 0) {
    return 0;
  }

  return (
    Math.floor(offsetMs / WAVEFORM_SAMPLE_INTERVAL_MS) *
    WAVEFORM_SAMPLE_INTERVAL_MS
  );
}

export function chunkStartForOffset(offsetMs: number): number {
  return (
    Math.floor(offsetMs / WAVEFORM_CHUNK_DURATION_MS) *
    WAVEFORM_CHUNK_DURATION_MS
  );
}

export function samplesToChunkPatches(
  startOffsetMs: number,
  amplitudes: number[],
): WaveformChunkPatch[] {
  const alignedStart = alignOffsetMs(startOffsetMs);
  const patches = new Map<number, WaveformSampleWrite[]>();

  for (let i = 0; i < amplitudes.length; i += 1) {
    const offsetMs = alignedStart + i * WAVEFORM_SAMPLE_INTERVAL_MS;
    const chunkStart = chunkStartForOffset(offsetMs);
    const index =
      (offsetMs - chunkStart) / WAVEFORM_SAMPLE_INTERVAL_MS;
    const value = amplitudes[i]!;

    const writes = patches.get(chunkStart) ?? [];
    writes.push({ index, value });
    patches.set(chunkStart, writes);
  }

  return [...patches.entries()]
    .sort(([left], [right]) => left - right)
    .map(([chunkStart, writes]) => ({
      startOffsetMs: chunkStart,
      writes,
    }));
}

export function mergeAmplitudes(
  existing: Uint8Array | Buffer | null,
  writes: WaveformSampleWrite[],
): Buffer {
  let maxIndex = existing && existing.length > 0 ? existing.length - 1 : -1;

  for (const write of writes) {
    maxIndex = Math.max(maxIndex, write.index);
  }

  const length = Math.min(maxIndex + 1, WAVEFORM_SAMPLES_PER_CHUNK);
  const result = new Uint8Array(Math.max(length, 0));

  if (existing && existing.length > 0) {
    result.set(
      existing.subarray(0, Math.min(existing.length, result.length)),
    );
  }

  for (const write of writes) {
    if (write.index >= 0 && write.index < WAVEFORM_SAMPLES_PER_CHUNK) {
      result[write.index] = write.value;
    }
  }

  return Buffer.from(result);
}

export function amplitudesToArray(
  amplitudes: Uint8Array | Buffer,
): number[] {
  return Array.from(amplitudes);
}
