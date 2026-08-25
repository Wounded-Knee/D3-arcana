import { objectKeyForFragment, objectKeyForTrack } from "./config.js";
import type { ObjectStore } from "./types.js";

export class InMemoryObjectStore implements ObjectStore {
  readonly issuedUrls: { key: string; expiresInSeconds: number }[] = [];
  readonly puts: { key: string; body: Buffer; contentType: string }[] = [];
  private readonly objects = new Map<string, Buffer>();

  objectKeyForTrack(
    conversationId: string,
    callId: string,
    userId: string,
    trackSid: string,
    recordingId: string,
  ): string {
    return objectKeyForTrack(
      conversationId,
      callId,
      userId,
      trackSid,
      recordingId,
    );
  }

  objectKeyForFragment(sessionPrefix: string, callOffsetMs: number): string {
    return objectKeyForFragment(sessionPrefix, callOffsetMs);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.puts.push({ key, body, contentType });
    this.objects.set(key, Buffer.from(body));
  }

  async get(key: string): Promise<Buffer | null> {
    const body = this.objects.get(key);
    return body ? Buffer.from(body) : null;
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async ensureReady(): Promise<void> {}

  async issueReadUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    this.issuedUrls.push({ key, expiresInSeconds });
    return `https://recordings.test/${encodeURIComponent(key)}?exp=${expiresInSeconds}`;
  }
}
