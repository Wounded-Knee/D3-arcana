export const SILENCE_RMS_THRESHOLD = 200;
export const SILENCE_HOLD_MS = 600;

export function pcmRms(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / 2);
  if (samples <= 0) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    const sample = pcm.readInt16LE(i * 2);
    sum += sample * sample;
  }

  return Math.sqrt(sum / samples);
}

export function isSilentPcm(
  pcm: Buffer,
  threshold = SILENCE_RMS_THRESHOLD,
): boolean {
  return pcmRms(pcm) < threshold;
}

export type TrackSilenceState = {
  muted: boolean;
  silent: boolean;
  silentSinceMs: number | null;
};

export class CallSilenceWatch {
  private readonly tracks = new Map<string, TrackSilenceState>();
  private emitted = false;

  update(
    trackSid: string,
    update: { muted?: boolean; silent?: boolean },
    nowMs = Date.now(),
  ): void {
    const current = this.tracks.get(trackSid) ?? {
      muted: false,
      silent: true,
      silentSinceMs: nowMs,
    };

    if (update.muted !== undefined) {
      current.muted = update.muted;
    }

    if (update.silent !== undefined) {
      current.silent = update.silent;
    }

    const quiet = current.muted || current.silent;
    if (quiet) {
      current.silentSinceMs ??= nowMs;
    } else {
      current.silentSinceMs = null;
      this.emitted = false;
    }

    this.tracks.set(trackSid, current);
  }

  remove(trackSid: string): void {
    this.tracks.delete(trackSid);
    this.emitted = false;
  }

  shouldJoinLive(nowMs = Date.now(), holdMs = SILENCE_HOLD_MS): boolean {
    if (this.tracks.size === 0 || this.emitted) {
      return false;
    }

    for (const track of this.tracks.values()) {
      if (track.muted) {
        continue;
      }

      if (track.silentSinceMs === null || nowMs - track.silentSinceMs < holdMs) {
        return false;
      }
    }

    this.emitted = true;
    return true;
  }
}

const watches = new Map<string, CallSilenceWatch>();

export function silenceWatchForCall(callId: string): CallSilenceWatch {
  let watch = watches.get(callId);
  if (!watch) {
    watch = new CallSilenceWatch();
    watches.set(callId, watch);
  }

  return watch;
}

export function clearSilenceWatch(callId: string): void {
  watches.delete(callId);
}

export function resetSilenceWatchesForTests(): void {
  watches.clear();
}
