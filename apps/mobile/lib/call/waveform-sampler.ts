export const WAVEFORM_SAMPLE_INTERVAL_MS = 50;
export const WAVEFORM_SAMPLE_RATE_HZ = 20;
export const WAVEFORM_CHUNK_DURATION_MS = 1000;
export const WAVEFORM_BATCH_SAMPLES = 10;
export const WAVEFORM_MAX_PENDING_BATCHES = 60;

export function alignOffsetMs(offsetMs: number): number {
  if (!Number.isFinite(offsetMs) || offsetMs < 0) {
    return 0;
  }

  return (
    Math.floor(offsetMs / WAVEFORM_SAMPLE_INTERVAL_MS) *
    WAVEFORM_SAMPLE_INTERVAL_MS
  );
}

export function quantizeAmplitude(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.max(0, Math.min(255, Math.round(level * 255)));
}

export function chunkStartForOffset(offsetMs: number): number {
  return (
    Math.floor(offsetMs / WAVEFORM_CHUNK_DURATION_MS) *
    WAVEFORM_CHUNK_DURATION_MS
  );
}

export type WaveformBatch = {
  startOffsetMs: number;
  amplitudes: number[];
};

export type WaveformSamplerOptions = {
  startedAtMs: number;
  postBatch: (batch: WaveformBatch) => Promise<void>;
  onSample?: (offsetMs: number, amplitude: number) => void;
  now?: () => number;
};

export class WaveformSampler {
  private buffer: number[] = [];
  private bufferStart: number | null = null;
  private pending: WaveformBatch[] = [];
  private draining = false;
  private stopped = false;
  private readonly startedAtMs: number;
  private readonly postBatch: (batch: WaveformBatch) => Promise<void>;
  private readonly onSample?: (offsetMs: number, amplitude: number) => void;
  private readonly now: () => number;

  constructor(options: WaveformSamplerOptions) {
    this.startedAtMs = options.startedAtMs;
    this.postBatch = options.postBatch;
    this.onSample = options.onSample;
    this.now = options.now ?? (() => Date.now());
  }

  push(level: number): void {
    if (this.stopped) {
      return;
    }

    const offsetMs = alignOffsetMs(this.now() - this.startedAtMs);
    if (offsetMs < 0) {
      return;
    }

    const amplitude = quantizeAmplitude(level);
    this.onSample?.(offsetMs, amplitude);

    if (this.bufferStart !== null && this.buffer.length > 0) {
      const lastOffset =
        this.bufferStart + (this.buffer.length - 1) * WAVEFORM_SAMPLE_INTERVAL_MS;

      if (offsetMs === lastOffset) {
        const lastIndex = this.buffer.length - 1;
        this.buffer[lastIndex] = Math.max(this.buffer[lastIndex]!, amplitude);
        return;
      }

      const expectedNext = lastOffset + WAVEFORM_SAMPLE_INTERVAL_MS;
      if (offsetMs !== expectedNext) {
        this.enqueueFlush();
      }
    }

    if (this.buffer.length === 0) {
      this.bufferStart = offsetMs;
    }

    this.buffer.push(amplitude);

    if (this.buffer.length >= WAVEFORM_BATCH_SAMPLES) {
      this.enqueueFlush();
    }
  }

  stop(): void {
    this.stopped = true;
    this.enqueueFlush();
  }

  private enqueueFlush(): void {
    if (this.buffer.length === 0 || this.bufferStart === null) {
      return;
    }

    this.pending.push({
      startOffsetMs: this.bufferStart,
      amplitudes: this.buffer,
    });
    this.buffer = [];
    this.bufferStart = null;

    if (this.pending.length > WAVEFORM_MAX_PENDING_BATCHES) {
      this.pending.splice(0, this.pending.length - WAVEFORM_MAX_PENDING_BATCHES);
    }

    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;

    try {
      while (this.pending.length > 0) {
        const batch = this.pending[0]!;

        try {
          await this.postBatch(batch);
          this.pending.shift();
        } catch {
          break;
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
