import { describe, expect, it } from "vitest";

import {
  alignOffsetMs,
  amplitudesToArray,
  chunkStartForOffset,
  mergeAmplitudes,
  samplesToChunkPatches,
} from "./waveform.js";

describe("waveform helpers", () => {
  it("aligns offsets down to the 50ms grid", () => {
    expect(alignOffsetMs(0)).toBe(0);
    expect(alignOffsetMs(49)).toBe(0);
    expect(alignOffsetMs(50)).toBe(50);
    expect(alignOffsetMs(980)).toBe(950);
  });

  it("maps offsets onto 1s chunk starts", () => {
    expect(chunkStartForOffset(0)).toBe(0);
    expect(chunkStartForOffset(999)).toBe(0);
    expect(chunkStartForOffset(1000)).toBe(1000);
    expect(chunkStartForOffset(2500)).toBe(2000);
  });

  it("splits a batch that crosses a second boundary", () => {
    const patches = samplesToChunkPatches(800, [1, 2, 3, 4, 5]);

    expect(patches).toEqual([
      {
        startOffsetMs: 0,
        writes: [
          { index: 16, value: 1 },
          { index: 17, value: 2 },
          { index: 18, value: 3 },
          { index: 19, value: 4 },
        ],
      },
      {
        startOffsetMs: 1000,
        writes: [{ index: 0, value: 5 }],
      },
    ]);
  });

  it("merges writes into an existing partial chunk", () => {
    const first = mergeAmplitudes(null, [
      { index: 0, value: 10 },
      { index: 1, value: 20 },
    ]);
    expect(amplitudesToArray(first)).toEqual([10, 20]);

    const second = mergeAmplitudes(first, [
      { index: 10, value: 30 },
    ]);
    const values = amplitudesToArray(second);
    expect(values).toHaveLength(11);
    expect(values[0]).toBe(10);
    expect(values[1]).toBe(20);
    expect(values[10]).toBe(30);
  });

  it("overwrites the same indices on retry", () => {
    const first = mergeAmplitudes(null, [
      { index: 0, value: 1 },
      { index: 1, value: 2 },
    ]);
    const retried = mergeAmplitudes(first, [
      { index: 0, value: 9 },
      { index: 1, value: 8 },
    ]);

    expect(amplitudesToArray(retried)).toEqual([9, 8]);
  });
});
