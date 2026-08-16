import { describe, expect, it } from "vitest";

import { encodeWavPcm16le, fragmentByteLength, pcmDurationMs } from "./wav.js";

describe("wav encoder", () => {
  it("writes a 44-byte stereo header and reports duration", () => {
    const pcm = Buffer.alloc(96_000);
    const wav = encodeWavPcm16le(pcm);

    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt32LE(24)).toBe(48_000);
    expect(wav.length).toBe(96_044);
    expect(pcmDurationMs(pcm)).toBe(500);
    expect(fragmentByteLength(500)).toBe(96_000);
  });
});
