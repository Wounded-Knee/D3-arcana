export const CATCHUP_RATE = 1.75;
export const READY_EDGE_LAG_MS = 500;

export function acceleratedPlayhead(
  originPlayhead: number,
  elapsedMs: number,
  rate: number,
  untilMs: number,
): number {
  return Math.min(untilMs, originPlayhead + elapsedMs * rate);
}

export function isAtReadyEdge(
  playheadMs: number,
  nowMs: number,
  lagMs = READY_EDGE_LAG_MS,
): boolean {
  return playheadMs >= nowMs - lagMs;
}
