export const WAVEFORM_SAMPLE_INTERVAL_MS = 50;
export const WAVEFORM_SAMPLE_RATE_HZ = 20;
export const WAVEFORM_CHUNK_DURATION_MS = 1000;
export const WAVEFORM_BATCH_SAMPLES = 3;
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

export const WAVEFORM_RANGE_WINDOW = 40;
export const WAVEFORM_PAUSE_WINDOW = 12;
export const WAVEFORM_PEAK_DECAY = 0.9995;
export const WAVEFORM_FLOOR_PERCENTILE = 0.15;
export const WAVEFORM_FLOOR_MARGIN = 1.15;
export const WAVEFORM_SPEECH_ONSET_RATIO = 1.4;
export const WAVEFORM_RELATIVE_FLOOR = 0.75;

export function quantizeAgainstRange(
  level: number,
  floor: number,
  peak: number,
): number {
  if (!Number.isFinite(level) || level <= 0) {
    return 0;
  }

  const safeFloor = Math.max(1e-6, floor);
  if (level <= safeFloor || peak <= safeFloor) {
    return 0;
  }

  const db = 20 * Math.log10(Math.min(1, level));
  const minDb = 20 * Math.log10(Math.min(1, safeFloor));
  const maxDb = 20 * Math.log10(Math.min(1, peak));
  const t = (db - minDb) / Math.max(1e-6, maxDb - minDb);
  return Math.max(0, Math.min(255, Math.round(t * 255)));
}

export function quantizeAmplitude(level: number): number {
  return quantizeAgainstRange(level, 10 ** (-22 / 20), 10 ** (-2 / 20));
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
  private recentLevels: number[] = [];
  private heldPeak = 0;
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

    const amplitude = this.quantizeLive(level);
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

  private quantizeLive(level: number): number {
    const sample = Number.isFinite(level) ? Math.max(0, level) : 0;
    if (sample <= 0) {
      return 0;
    }

    this.recentLevels.push(sample);
    if (this.recentLevels.length > WAVEFORM_RANGE_WINDOW) {
      this.recentLevels.shift();
    }

    const percentileFloor = (values: number[]): number => {
      const sorted = values.slice().sort((left, right) => left - right);
      const floorIndex = Math.min(
        sorted.length - 1,
        Math.floor(sorted.length * WAVEFORM_FLOOR_PERCENTILE),
      );
      return (sorted[floorIndex] ?? sample) * WAVEFORM_FLOOR_MARGIN;
    };

    const floor = percentileFloor(this.recentLevels);
    const pauseLevels = this.recentLevels.slice(-WAVEFORM_PAUSE_WINDOW);
    const pauseFloor = percentileFloor(pauseLevels);
    const pausePeak = Math.max(...pauseLevels);

    if (sample > floor * WAVEFORM_SPEECH_ONSET_RATIO) {
      this.heldPeak = Math.max(sample, this.heldPeak);
    } else if (this.heldPeak > 0) {
      this.heldPeak *= WAVEFORM_PEAK_DECAY;
    }

    const speechPeakReady = this.heldPeak >= floor * WAVEFORM_SPEECH_ONSET_RATIO;
    const flatPause =
      pauseLevels.length >= 8 &&
      pausePeak <= pauseFloor * WAVEFORM_SPEECH_ONSET_RATIO;
    const displayFloor = Math.max(floor, this.heldPeak * WAVEFORM_RELATIVE_FLOOR);

    return speechPeakReady && !flatPause
      ? quantizeAgainstRange(sample, displayFloor, this.heldPeak)
      : 0;
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
