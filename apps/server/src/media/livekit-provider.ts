import {
  AccessToken,
  EgressClient,
  RoomServiceClient,
  TrackSource,
  TrackType,
  WebhookReceiver,
} from "livekit-server-sdk";

import type { ObjectStoreConfig } from "../storage/types.js";
import type {
  IssueJoinCredentialsParams,
  IssuedJoinCredentials,
  JoinRole,
  MediaHealth,
  MediaSessionProvider,
  PublishedAudioTrack,
  StartedTrackRecording,
  StartTrackRecordingParams,
} from "./types.js";

const TOKEN_TTL_SECONDS = 60 * 60;
const HEALTH_TIMEOUT_MS = 2_000;

function roomNameForCall(callId: string): string {
  return `call-${callId}`;
}

function toWsUrl(serverUrl: string): string {
  if (serverUrl.startsWith("ws://") || serverUrl.startsWith("wss://")) {
    return serverUrl;
  }

  return serverUrl.replace(/^http/, "ws");
}

export interface LiveKitMediaSessionProviderConfig {
  /** Server-side LiveKit HTTP API (control plane). */
  url: string;
  /** Client-reachable WebSocket URL returned in join credentials. */
  publicUrl?: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
  objectStore: ObjectStoreConfig;
}

export class LiveKitMediaSessionProvider implements MediaSessionProvider {
  private readonly clientWsUrl: string;
  private readonly roomService: RoomServiceClient;
  private readonly egress: EgressClient;
  private readonly webhookReceiver: WebhookReceiver;

  constructor(private readonly config: LiveKitMediaSessionProviderConfig) {
    this.clientWsUrl = toWsUrl(config.publicUrl ?? config.url);
    this.roomService = new RoomServiceClient(
      config.url,
      config.apiKey,
      config.apiSecret,
    );
    this.egress = new EgressClient(
      config.url,
      config.apiKey,
      config.apiSecret,
    );
    this.webhookReceiver = new WebhookReceiver(
      config.apiKey,
      config.webhookSecret,
    );
  }

  async ensureRoom(callId: string): Promise<void> {
    const name = roomNameForCall(callId);

    try {
      await this.roomService.createRoom({ name });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      if (!message.toLowerCase().includes("already exists")) {
        throw error;
      }
    }
  }

  async endRoom(callId: string): Promise<void> {
    const name = roomNameForCall(callId);

    try {
      await this.roomService.deleteRoom(name);
    } catch (error) {
      if (!isLiveKitMissing(error)) {
        throw error;
      }
    }
  }

  async issueJoinCredentials(
    params: IssueJoinCredentialsParams,
  ): Promise<IssuedJoinCredentials> {
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
    const token = new AccessToken(
      this.config.apiKey,
      this.config.apiSecret,
      {
        identity: params.userId,
        name: params.displayName,
        ttl: TOKEN_TTL_SECONDS,
      },
    );

    token.addGrant({
      roomJoin: true,
      room: roomNameForCall(params.callId),
      canPublish: params.role === "publisher",
      canSubscribe: true,
    });

    return {
      provider: "livekit",
      url: this.clientWsUrl,
      token: await token.toJwt(),
      expiresAt,
    };
  }

  async startTrackRecording(
    params: StartTrackRecordingParams,
  ): Promise<StartedTrackRecording> {
    const info = await this.egress.startTrackEgress(
      roomNameForCall(params.callId),
      params.websocketUrl,
      params.trackSid,
    );

    if (!info.egressId) {
      throw new Error("LiveKit egress did not return an egress id");
    }

    return { egressId: info.egressId };
  }

  async stopTrackRecording(egressId: string): Promise<void> {
    try {
      await this.egress.stopEgress(egressId);
    } catch (error) {
      if (!isLiveKitMissing(error)) {
        throw error;
      }
    }
  }

  async stopRecordingsForCall(callId: string): Promise<void> {
    const active = await this.egress.listEgress({
      roomName: roomNameForCall(callId),
      active: true,
    });

    await Promise.all(
      active.map((info) =>
        info.egressId ? this.stopTrackRecording(info.egressId) : Promise.resolve(),
      ),
    );
  }

  async listPublishedAudioTracks(
    callId: string,
  ): Promise<PublishedAudioTrack[]> {
    try {
      const participants = await this.roomService.listParticipants(
        roomNameForCall(callId),
      );
      const tracks: PublishedAudioTrack[] = [];

      for (const participant of participants) {
        for (const track of participant.tracks) {
          if (!isMicrophoneAudioTrack(track.type, track.source)) {
            continue;
          }

          tracks.push({
            userId: participant.identity,
            trackSid: track.sid,
          });
        }
      }

      return tracks;
    } catch (error) {
      if (isLiveKitMissing(error)) {
        return [];
      }

      throw error;
    }
  }

  async verifyWebhook(
    body: Buffer,
    authorization: string | undefined,
  ): Promise<unknown> {
    return this.webhookReceiver.receive(body.toString(), authorization);
  }

  async checkHealth(): Promise<MediaHealth> {
    try {
      await withTimeout(this.roomService.listRooms(), HEALTH_TIMEOUT_MS);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function isMicrophoneAudioTrack(
  type: unknown,
  source: unknown,
): boolean {
  const typeValue = normalizeEnum(type);
  const sourceValue = normalizeEnum(source);

  if (typeValue !== TrackType.AUDIO && typeValue !== "AUDIO") {
    return false;
  }

  return (
    sourceValue === TrackSource.MICROPHONE ||
    sourceValue === "MICROPHONE" ||
    sourceValue === TrackSource.UNKNOWN ||
    sourceValue === "UNKNOWN" ||
    sourceValue === 0 ||
    sourceValue === undefined ||
    sourceValue === ""
  );
}

function normalizeEnum(value: unknown): unknown {
  if (value && typeof value === "object" && "value" in value) {
    return (value as { value: unknown }).value;
  }

  return value;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function isLiveKitMissing(error: unknown): boolean {
  if (error && typeof error === "object") {
    const record = error as { status?: unknown; code?: unknown };
    if (record.status === 404 || record.code === "not_found") {
      return true;
    }
  }

  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("not found") || message.includes("does not exist")
  );
}

export function parseCallIdFromRoomName(roomName: string): string | null {
  const prefix = "call-";
  if (!roomName.startsWith(prefix)) {
    return null;
  }

  const callId = roomName.slice(prefix.length);
  return callId.length > 0 ? callId : null;
}

export { roomNameForCall, toWsUrl };
