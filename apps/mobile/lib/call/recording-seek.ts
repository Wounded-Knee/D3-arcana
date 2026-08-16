export function fileTimeSec(
  playheadMs: number,
  callOffsetMs: number,
): number {
  return (playheadMs - callOffsetMs) / 1000;
}

export function isAudibleAtPlayhead(
  playheadMs: number,
  callOffsetMs: number,
  durationMs: number,
): boolean {
  const elapsed = playheadMs - callOffsetMs;
  return elapsed >= 0 && elapsed <= durationMs;
}
