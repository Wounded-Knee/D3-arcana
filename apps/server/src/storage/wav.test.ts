import { describe, expect, it } from "vitest";

import {
  concatTimedWavs,
  concatWavFiles,
  encodeWavPcm16le,
  extractWavPcm,
  fragmentByteLength,
  pcmDurationMs,
  wavDurationMs,
} from "./wav.js";

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

  it("concatenates PCM from sequential clips and fills a gap with silence", () => {
    const first = encodeWavPcm16le(Buffer.alloc(fragmentByteLength(500), 1));
    const second = encodeWavPcm16le(Buffer.alloc(fragmentByteLength(500), 2));
    const joined = concatWavFiles([first, second]);

    expect(pcmDurationMs(extractWavPcm(joined))).toBe(1000);

    const gapped = concatTimedWavs([
      { wav: first, callOffsetMs: 0 },
      { wav: second, callOffsetMs: 1000 },
    ]);
    expect(gapped.readUInt16LE(22)).toBe(1);
    expect(wavDurationMs(gapped)).toBe(1500);
  });

  it("downmixes identical stereo clips to mono without changing duration", () => {
    const pcm = Buffer.alloc(fragmentByteLength(500));
    for (let i = 0; i < pcm.length; i += 2) {
      pcm.writeInt16LE(i % 2000, i);
    }
    const stereo = encodeWavPcm16le(pcm);
    const joined = concatTimedWavs([{ wav: stereo, callOffsetMs: 0 }]);

    expect(joined.readUInt16LE(22)).toBe(1);
    expect(wavDurationMs(joined)).toBe(500);
  });
});
