import {
  fileTimeSec,
  isAudibleAtPlayhead,
} from './recording-seek';
import type { PlaybackClock, RecordingSegment } from './playback-types';

const MAX_ELEMENTS = 16;

export function createPlaybackClock(): PlaybackClock {
  const elements = new Map<string, HTMLAudioElement>();
  let raf = 0;
  let startedAt = 0;
  let originPlayhead = 0;
  let untilMs = 0;
  let rate = 1;
  let onPlayhead: ((playheadMs: number) => void) | null = null;
  let onEnded: (() => void) | null = null;
  let segments: RecordingSegment[] = [];
  let soloUserId: string | null = null;

  function currentPlayhead(): number {
    if (!raf) {
      return originPlayhead;
    }

    return Math.min(
      untilMs,
      originPlayhead + (performance.now() - startedAt) * rate,
    );
  }

  function audibleSegments(playheadMs: number): RecordingSegment[] {
    return segments.filter((segment) => {
      if (!segment.playbackUrl || segment.durationMs <= 0) {
        return false;
      }
      if (soloUserId && segment.userId !== soloUserId) {
        return false;
      }
      return isAudibleAtPlayhead(
        playheadMs,
        segment.callOffsetMs,
        segment.durationMs,
      );
    });
  }

  function evict(playheadMs: number, keepIds: Set<string>): void {
    if (elements.size <= MAX_ELEMENTS) {
      return;
    }

    const ranked = [...elements.entries()]
      .filter(([id]) => !keepIds.has(id))
      .map(([id, element]) => {
        const segment = segments.find((item) => item.id === id);
        const distance = segment
          ? Math.abs(playheadMs - segment.callOffsetMs)
          : Number.POSITIVE_INFINITY;
        return { id, element, distance };
      })
      .sort((a, b) => b.distance - a.distance);

    while (elements.size > MAX_ELEMENTS && ranked.length > 0) {
      const next = ranked.shift();
      if (!next) {
        break;
      }
      next.element.pause();
      next.element.src = '';
      elements.delete(next.id);
    }
  }

  function elementFor(segment: RecordingSegment): HTMLAudioElement | null {
    if (!segment.playbackUrl) {
      return null;
    }

    let element = elements.get(segment.id);
    if (!element) {
      element = new Audio(segment.playbackUrl);
      element.preload = 'auto';
      elements.set(segment.id, element);
    } else if (element.src !== segment.playbackUrl) {
      element.src = segment.playbackUrl;
    }

    element.playbackRate = rate;
    return element;
  }

  function sync(playheadMs: number): void {
    const audible = audibleSegments(playheadMs);
    const audibleIds = new Set(audible.map((item) => item.id));

    for (const segment of segments) {
      if (!audibleIds.has(segment.id)) {
        const element = elements.get(segment.id);
        if (element && !element.paused) {
          element.pause();
        }
        continue;
      }

      const element = elementFor(segment);
      if (!element) {
        continue;
      }

      const target = fileTimeSec(playheadMs, segment.callOffsetMs);
      if (Math.abs(element.currentTime - target) > 0.25) {
        element.currentTime = Math.max(0, target);
      }

      if (element.paused) {
        void element.play().catch(() => undefined);
      }
    }

    evict(playheadMs, audibleIds);
  }

  function tick(): void {
    const playheadMs = currentPlayhead();
    onPlayhead?.(playheadMs);
    sync(playheadMs);

    if (playheadMs >= untilMs) {
      pause();
      onEnded?.();
      return;
    }

    raf = requestAnimationFrame(tick);
  }

  function pause(): void {
    const playheadMs = currentPlayhead();
    cancelAnimationFrame(raf);
    raf = 0;
    originPlayhead = playheadMs;
    for (const element of elements.values()) {
      element.pause();
    }
  }

  return {
    play(options) {
      pause();
      segments = options.segments;
      soloUserId = options.soloUserId;
      originPlayhead = options.playheadMs;
      untilMs = options.untilMs;
      rate = options.playbackRate ?? 1;
      onPlayhead = options.onPlayhead;
      onEnded = options.onEnded;
      startedAt = performance.now();
      sync(options.playheadMs);
      raf = requestAnimationFrame(tick);
    },
    pause,
    setPlaybackRate(nextRate) {
      const playheadMs = currentPlayhead();
      originPlayhead = playheadMs;
      startedAt = performance.now();
      rate = nextRate;
      for (const element of elements.values()) {
        element.playbackRate = nextRate;
      }
    },
    update(options) {
      if (options.segments) {
        segments = options.segments;
      }
      if (options.untilMs !== undefined) {
        untilMs = options.untilMs;
      }
    },
  };
}
