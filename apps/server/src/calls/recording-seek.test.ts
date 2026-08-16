import { describe, expect, it } from "vitest";

import {
  fileTimeSec,
  isAudibleAtPlayhead,
  nanosToMs,
} from "./recording-seek.js";

describe("recording seek mapping", () => {
  it("maps playhead to file time", () => {
    expect(fileTimeSec(12_500, 10_000)).toBe(2.5);
  });

  it("is audible only inside the segment", () => {
    expect(isAudibleAtPlayhead(9_999, 10_000, 5_000)).toBe(false);
    expect(isAudibleAtPlayhead(10_000, 10_000, 5_000)).toBe(true);
    expect(isAudibleAtPlayhead(15_000, 10_000, 5_000)).toBe(true);
    expect(isAudibleAtPlayhead(15_001, 10_000, 5_000)).toBe(false);
  });

  it("converts nanosecond durations", () => {
    expect(nanosToMs(2_500_000_000n)).toBe(2500);
    expect(nanosToMs(0)).toBe(0);
  });
});
