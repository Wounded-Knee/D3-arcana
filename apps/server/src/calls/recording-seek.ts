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

export function nanosToMs(value: bigint | number | string | undefined): number {
  if (value === undefined) {
    return 0;
  }

  const nanos = typeof value === "bigint" ? value : BigInt(value);
  if (nanos <= 0n) {
    return 0;
  }

  return Number(nanos / 1_000_000n);
}
