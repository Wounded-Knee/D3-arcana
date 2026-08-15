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
