export interface ObjectStore {
  ensureReady(): Promise<void>;
  objectKeyForTrack(
    conversationId: string,
    callId: string,
    userId: string,
    trackSid: string,
    recordingId: string,
  ): string;
  objectKeyForFragment(sessionPrefix: string, callOffsetMs: number): string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  issueReadUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export interface ObjectStoreConfig {
  endpoint: string;
  publicEndpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
  forcePathStyle: boolean;
}

export const RECORDING_CONTENT_TYPE = "audio/wav";
export const RECORDING_FORMAT = "fragments";
export const FRAGMENT_CONTENT_TYPE = "audio/wav";
export const FRAGMENT_FORMAT = "wav";
export const PLAYBACK_URL_TTL_SECONDS = 15 * 60;
export const FRAGMENT_DURATION_MS = 500;
export const PCM_SAMPLE_RATE_HZ = 48_000;
/** LiveKit track-egress websocket PCM is s16le stereo, typically 48 kHz. */
export const PCM_CHANNELS = 2;
