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

export function wavFormat(wav: Buffer): { sampleRate: number; channels: number } {
  return {
    channels: wav.length >= 24 ? wav.readUInt16LE(22) : PCM_CHANNELS,
    sampleRate: wav.length >= 28 ? wav.readUInt32LE(24) : PCM_SAMPLE_RATE_HZ,
  };
}

export function wavDurationMs(wav: Buffer): number {
  const { sampleRate, channels } = wavFormat(wav);
  return pcmDurationMs(extractWavPcm(wav), sampleRate, channels);
}

export function downmixInterleavedToMono(pcm: Buffer, channels: number): Buffer {
  if (channels <= 1) {
    return pcm;
  }

  const frames = Math.floor(pcm.length / (2 * channels));
  const out = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += pcm.readInt16LE((i * channels + channel) * 2);
    }
    const sample = Math.round(sum / channels);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return out;
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
    return encodeWavPcm16le(Buffer.alloc(0), sampleRate, 1);
  }

  const sorted = [...clips].sort((a, b) => a.callOffsetMs - b.callOffsetMs);
  const first = wavFormat(sorted[0]!.wav);
  const outRate = first.sampleRate || sampleRate;
  const outChannels = 1;
  const parts: Buffer[] = [];
  let cursorMs = sorted[0]!.callOffsetMs;

  for (const clip of sorted) {
    const format = wavFormat(clip.wav);
    const pcm = downmixInterleavedToMono(
      extractWavPcm(clip.wav),
      format.channels || channels,
    );
    if (clip.callOffsetMs > cursorMs) {
      const gapBytes = fragmentByteLength(
        clip.callOffsetMs - cursorMs,
        outRate,
        outChannels,
      );
      if (gapBytes > 0) {
        parts.push(Buffer.alloc(gapBytes));
      }
    }
    parts.push(pcm);
    cursorMs = clip.callOffsetMs + pcmDurationMs(pcm, outRate, outChannels);
  }

  return encodeWavPcm16le(Buffer.concat(parts), outRate, outChannels);
}
