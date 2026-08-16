const TICK_INTERVALS_MS = [1_000, 5_000, 10_000, 30_000, 60_000, 300_000];
const MIN_TICK_PX = 64;

export const MIN_VIEWPORT_MS = 5_000;
export const DEFAULT_VIEWPORT_MS = 30_000;
export const BAR_WIDTH_PX = 3;

export function tickIntervalMs(msPerPixel: number): number {
  const needed = msPerPixel * MIN_TICK_PX;
  return TICK_INTERVALS_MS.find((interval) => interval >= needed) ?? 300_000;
}

export function formatTick(offsetMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(offsetMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export type TimelineTick = {
  offsetMs: number;
  label: string;
  x: number;
};

export function ticksForViewport(
  viewStartMs: number,
  viewEndMs: number,
  msPerPixel: number,
): TimelineTick[] {
  const interval = tickIntervalMs(msPerPixel);
  const first = Math.ceil(viewStartMs / interval) * interval;
  const ticks: TimelineTick[] = [];

  for (let offsetMs = first; offsetMs <= viewEndMs; offsetMs += interval) {
    ticks.push({
      offsetMs,
      label: formatTick(offsetMs),
      x: (offsetMs - viewStartMs) / msPerPixel,
    });
  }

  return ticks;
}

export function clampMsPerPixel(
  msPerPixel: number,
  width: number,
  durationMs: number,
): number {
  if (width <= 0) {
    return msPerPixel;
  }

  const min = MIN_VIEWPORT_MS / width;
  const max = Math.max(durationMs, DEFAULT_VIEWPORT_MS) / width;
  return Math.min(max, Math.max(min, msPerPixel));
}

export function clampViewStart(
  viewStartMs: number,
  viewportMs: number,
  durationMs: number,
): number {
  const maxStart = Math.max(0, durationMs - viewportMs * 0.15);
  return Math.min(maxStart, Math.max(0, viewStartMs));
}
