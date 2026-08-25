import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

import {
  fileTimeSec,
  isAudibleAtPlayhead,
} from './recording-seek';
import {
  isUpcomingSegment,
  shouldSeekAudio,
} from './playback-sync';
import type { PlaybackClock, RecordingSegment } from './playback-types';

const MAX_PLAYERS = 16;

type PooledPlayer = {
  player: AudioPlayer;
  uri: string;
  appliedRate: number | null;
};

let audioModeReady = false;

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) {
    return;
  }

  audioModeReady = true;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'duckOthers',
    allowsRecording: false,
  });
}

export function createPlaybackClock(): PlaybackClock {
  const players = new Map<string, PooledPlayer>();
  const seeking = new Set<string>();
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

  function releasePlayer(id: string): void {
    const pooled = players.get(id);
    if (!pooled) {
      return;
    }

    pooled.player.pause();
    pooled.player.remove();
    players.delete(id);
    seeking.delete(id);
  }

  function evict(playheadMs: number, keepIds: Set<string>): void {
    if (players.size <= MAX_PLAYERS) {
      return;
    }

    const ranked = [...players.entries()]
      .filter(([id]) => !keepIds.has(id))
      .map(([id, pooled]) => {
        const segment = segments.find((item) => item.id === id);
        const distance = segment
          ? Math.abs(playheadMs - segment.callOffsetMs)
          : Number.POSITIVE_INFINITY;
        return { id, pooled, distance };
      })
      .sort((a, b) => b.distance - a.distance);

    while (players.size > MAX_PLAYERS && ranked.length > 0) {
      const next = ranked.shift();
      if (!next) {
        break;
      }
      releasePlayer(next.id);
    }
  }

  function applyPlaybackRate(pooled: PooledPlayer): void {
    if (pooled.appliedRate === rate) {
      return;
    }
    const previous = pooled.appliedRate;
    pooled.appliedRate = rate;
    pooled.player.shouldCorrectPitch = rate !== 1;
    if (rate === 1 && previous == null) {
      return;
    }
    pooled.player.setPlaybackRate(rate);
  }

  function playerFor(segment: RecordingSegment): AudioPlayer | null {
    if (!segment.playbackUrl) {
      return null;
    }

    let pooled = players.get(segment.id);
    if (!pooled) {
      const player = createAudioPlayer(
        { uri: segment.playbackUrl },
        { keepAudioSessionActive: true },
      );
      pooled = { player, uri: segment.playbackUrl, appliedRate: null };
      players.set(segment.id, pooled);
    } else if (pooled.uri !== segment.playbackUrl) {
      pooled.player.replace({ uri: segment.playbackUrl });
      pooled.uri = segment.playbackUrl;
      pooled.appliedRate = null;
    }

    applyPlaybackRate(pooled);
    return pooled.player;
  }

  function sync(playheadMs: number): void {
    const audible = audibleSegments(playheadMs);
    const audibleIds = new Set(audible.map((item) => item.id));
    const keepIds = new Set(audibleIds);

    for (const segment of segments) {
      if (
        !segment.playbackUrl ||
        (soloUserId && segment.userId !== soloUserId)
      ) {
        continue;
      }
      if (
        isUpcomingSegment(
          playheadMs,
          segment.callOffsetMs,
          segment.durationMs,
        )
      ) {
        keepIds.add(segment.id);
        playerFor(segment);
      }
    }

    for (const segment of segments) {
      if (!audibleIds.has(segment.id)) {
        const pooled = players.get(segment.id);
        if (pooled?.player.playing) {
          pooled.player.pause();
        }
        continue;
      }

      const player = playerFor(segment);
      if (!player) {
        continue;
      }

      const target = Math.max(0, fileTimeSec(playheadMs, segment.callOffsetMs));
      if (seeking.has(segment.id)) {
        continue;
      }

      if (shouldSeekAudio(player.currentTime, target, player.playing)) {
        seeking.add(segment.id);
        void player
          .seekTo(target)
          .then(() => {
            seeking.delete(segment.id);
            if (raf && audibleIds.has(segment.id) && !player.playing) {
              player.play();
            }
          })
          .catch(() => {
            seeking.delete(segment.id);
          });
        continue;
      }

      if (!player.playing) {
        player.play();
      }
    }

    evict(playheadMs, keepIds);
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
    for (const { player } of players.values()) {
      player.pause();
    }
  }

  function dispose(): void {
    pause();
    for (const id of [...players.keys()]) {
      releasePlayer(id);
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
      raf = requestAnimationFrame(tick);
      void ensureAudioMode().then(() => {
        if (!raf) {
          return;
        }
        sync(currentPlayhead());
      });
    },
    pause,
    setPlaybackRate(nextRate) {
      const playheadMs = currentPlayhead();
      originPlayhead = playheadMs;
      startedAt = performance.now();
      rate = nextRate;
      for (const pooled of players.values()) {
        applyPlaybackRate(pooled);
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
    dispose,
  };
}
