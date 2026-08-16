import { getPreferredLanAddress } from "../dev/network.js";
import type { ObjectStoreConfig } from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function resolvePublicEndpoint(endpoint: string): string {
  if (process.env.OBJECT_STORE_PUBLIC_ENDPOINT) {
    return process.env.OBJECT_STORE_PUBLIC_ENDPOINT;
  }

  if (process.env.NODE_ENV === "production") {
    return endpoint;
  }

  try {
    const url = new URL(endpoint);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      const lan = getPreferredLanAddress();
      if (lan) {
        url.hostname = lan;
        return url.toString().replace(/\/$/, "");
      }
    }
  } catch {
    return endpoint;
  }

  return endpoint;
}

export function loadObjectStoreConfig(): ObjectStoreConfig {
  const endpoint = requireEnv("OBJECT_STORE_ENDPOINT");

  return {
    endpoint,
    publicEndpoint: resolvePublicEndpoint(endpoint),
    bucket: requireEnv("OBJECT_STORE_BUCKET"),
    accessKey: requireEnv("OBJECT_STORE_ACCESS_KEY"),
    secretKey: requireEnv("OBJECT_STORE_SECRET_KEY"),
    region: process.env.OBJECT_STORE_REGION ?? "us-east-1",
    forcePathStyle: process.env.OBJECT_STORE_FORCE_PATH_STYLE !== "false",
  };
}

export function objectKeyForTrack(
  conversationId: string,
  callId: string,
  userId: string,
  trackSid: string,
  recordingId: string,
): string {
  return `conversations/${conversationId}/calls/${callId}/participants/${userId}/${trackSid}/${recordingId}`;
}

export function objectKeyForFragment(
  sessionPrefix: string,
  callOffsetMs: number,
): string {
  return `${sessionPrefix}/${callOffsetMs}.wav`;
}
