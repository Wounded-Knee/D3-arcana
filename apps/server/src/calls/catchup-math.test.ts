import { describe, expect, it } from "vitest";

function acceleratedPlayhead(
  originPlayhead: number,
  elapsedMs: number,
  rate: number,
  untilMs: number,
): number {
  return Math.min(untilMs, originPlayhead + elapsedMs * rate);
}

function isAtReadyEdge(playheadMs: number, nowMs: number, lagMs = 500): boolean {
  return playheadMs >= nowMs - lagMs;
}

describe("catch-up playhead math", () => {
  it("advances at 1.75x then sits at the 500ms ready edge", () => {
    expect(acceleratedPlayhead(0, 4000, 1.75, 20_000)).toBe(7000);
    expect(isAtReadyEdge(9500, 10_000)).toBe(true);
    expect(isAtReadyEdge(9400, 10_000)).toBe(false);
    expect(acceleratedPlayhead(9500, 200, 1, 10_000)).toBe(9700);
  });
});
