import { describe, expect, it } from "vitest";

import { PcmFragmentBuffer } from "./pcm-fragment-buffer.js";

describe("PcmFragmentBuffer", () => {
  it("flushes exact 500ms chunks and a short remainder", () => {
    const buffer = new PcmFragmentBuffer(8);
    expect(buffer.append(Buffer.from([1, 2, 3, 4]))).toEqual([]);
    const first = buffer.append(Buffer.from([5, 6, 7, 8, 9]));
    expect(first).toHaveLength(1);
    expect([...first[0]!]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...buffer.flushRemainder()!]).toEqual([9]);
  });
});
