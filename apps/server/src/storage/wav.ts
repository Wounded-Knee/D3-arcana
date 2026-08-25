import { PCM_CHANNELS, PCM_SAMPLE_RATE_HZ } from "./types.js";

export function encodeWavPcm16le(
  pcm: Buffer,
  sampleRate = PCM_SAMPLE_RATE_HZ,
  channels = PCM_CHANNELS,
): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

export function pcmDurationMs(
  pcm: Buffer,
  sampleRate = PCM_SAMPLE_RATE_HZ,
  channels = PCM_CHANNELS,
): number {
  const samples = Math.floor(pcm.length / (2 * channels));
  return Math.round((samples / sampleRate) * 1000);
}

export function fragmentByteLength(
  durationMs: number,
  sampleRate = PCM_SAMPLE_RATE_HZ,
  channels = PCM_CHANNELS,
): number {
  return Math.round((durationMs / 1000) * sampleRate * channels * 2);
}

export const WAV_HEADER_BYTES = 44;

export function extractWavPcm(wav: Buffer): Buffer {
  if (wav.length < WAV_HEADER_BYTES) {
    throw new Error("WAV is too short to contain a header");
  }

  const dataSize = wav.readUInt32LE(40);
  const end = Math.min(wav.length, WAV_HEADER_BYTES + dataSize);
  return wav.subarray(WAV_HEADER_BYTES, end);
}

export function concatWavFiles(wavs: Buffer[]): Buffer {
  return encodeWavPcm16le(Buffer.concat(wavs.map(extractWavPcm)));
}

export function concatTimedWavs(
  clips: { wav: Buffer; callOffsetMs: number }[],
  sampleRate = PCM_SAMPLE_RATE_HZ,
  channels = PCM_CHANNELS,
): Buffer {
  if (clips.length === 0) {
    return encodeWavPcm16le(Buffer.alloc(0));
  }

  const sorted = [...clips].sort((a, b) => a.callOffsetMs - b.callOffsetMs);
  const parts: Buffer[] = [];
  let cursorMs = sorted[0]!.callOffsetMs;

  for (const clip of sorted) {
    const pcm = extractWavPcm(clip.wav);
    if (clip.callOffsetMs > cursorMs) {
      const gapBytes = fragmentByteLength(
        clip.callOffsetMs - cursorMs,
        sampleRate,
        channels,
      );
      if (gapBytes > 0) {
        parts.push(Buffer.alloc(gapBytes));
      }
    }
    parts.push(pcm);
    cursorMs = clip.callOffsetMs + pcmDurationMs(pcm, sampleRate, channels);
  }

  return encodeWavPcm16le(Buffer.concat(parts));
}
