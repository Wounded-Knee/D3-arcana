export const EGRESS_INGEST_PATH = "/internal/egress";

export function loadEgressIngestSecret(): string | undefined {
  return process.env.EGRESS_INGEST_SECRET;
}

export function loadEgressIngestBaseUrl(): string {
  if (process.env.EGRESS_INGEST_URL) {
    return process.env.EGRESS_INGEST_URL.replace(/\/$/, "");
  }

  const port = Number(process.env.PORT) || 3000;
  return `ws://127.0.0.1:${port}${EGRESS_INGEST_PATH}`;
}

export function buildEgressIngestUrl(params: {
  recordingId: string;
  callId: string;
  trackSid: string;
}): string {
  const secret = loadEgressIngestSecret();
  if (!secret) {
    throw new Error("Missing required environment variable: EGRESS_INGEST_SECRET");
  }

  const url = new URL(loadEgressIngestBaseUrl());
  url.searchParams.set("secret", secret);
  url.searchParams.set("recordingId", params.recordingId);
  url.searchParams.set("callId", params.callId);
  url.searchParams.set("trackSid", params.trackSid);
  return url.toString();
}
