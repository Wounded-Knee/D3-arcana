import type { Room } from 'livekit-client';

import { startLocalVolumeMonitor } from './local-volume';
import type { CallSessionListener } from './types';

export const AUDIO_LEVEL_INTERVAL_MS = 50;

export function startAudioLevelLoop(
  getLevel: () => number,
  listeners: Set<CallSessionListener>,
): () => void {
  const timer = setInterval(() => {
    const level = getLevel();
    for (const listener of listeners) {
      listener.onLocalAudioLevel?.(level);
    }
  }, AUDIO_LEVEL_INTERVAL_MS);

  return () => {
    clearInterval(timer);
  };
}

export function startMicAudioLevelLoop(
  room: Room,
  getMuted: () => boolean,
  listeners: Set<CallSessionListener>,
): () => void {
  let levelSum = 0;
  let levelCount = 0;
  const stopMonitor = startLocalVolumeMonitor(room, (level) => {
    levelSum += level;
    levelCount += 1;
  });
  const stopLoop = startAudioLevelLoop(() => {
    const rms = levelCount > 0 ? levelSum / levelCount : 0;
    levelSum = 0;
    levelCount = 0;
    return getMuted() ? 0 : rms;
  }, listeners);

  return () => {
    stopLoop();
    stopMonitor();
  };
}
