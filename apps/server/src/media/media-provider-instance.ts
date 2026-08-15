import { getPreferredLanAddress } from "../dev/network.js";
import { LiveKitMediaSessionProvider } from "./livekit-provider.js";
import type { MediaSessionProvider } from "./types.js";

function resolveLiveKitPublicUrl(): string | undefined {
  if (process.env.LIVEKIT_PUBLIC_URL) {
    return process.env.LIVEKIT_PUBLIC_URL;
  }

  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  const lan = getPreferredLanAddress();
  return lan ? `ws://${lan}:7880` : undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createMediaSessionProvider(): MediaSessionProvider {
  return new LiveKitMediaSessionProvider({
    url: requireEnv("LIVEKIT_URL"),
    publicUrl: resolveLiveKitPublicUrl(),
    apiKey: requireEnv("LIVEKIT_API_KEY"),
    apiSecret: requireEnv("LIVEKIT_API_SECRET"),
    webhookSecret:
      process.env.LIVEKIT_WEBHOOK_SECRET ??
      requireEnv("LIVEKIT_API_SECRET"),
  });
}

let instance: MediaSessionProvider | null = null;

export function getMediaSessionProvider(): MediaSessionProvider {
  if (!instance) {
    instance = createMediaSessionProvider();
  }

  return instance;
}

export function resetMediaSessionProviderForTests(): void {
  instance = null;
}

export function setMediaSessionProviderForTests(
  provider: MediaSessionProvider,
): void {
  instance = provider;
}
