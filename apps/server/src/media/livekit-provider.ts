import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from "livekit-server-sdk";

import type {
  IssueJoinCredentialsParams,
  IssuedJoinCredentials,
  JoinRole,
  MediaHealth,
  MediaSessionProvider,
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
}

export class LiveKitMediaSessionProvider implements MediaSessionProvider {
  private readonly clientWsUrl: string;
  private readonly roomService: RoomServiceClient;
  private readonly webhookReceiver: WebhookReceiver;

  constructor(private readonly config: LiveKitMediaSessionProviderConfig) {
    this.clientWsUrl = toWsUrl(config.publicUrl ?? config.url);
    this.roomService = new RoomServiceClient(
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
      const message =
        error instanceof Error ? error.message : String(error);

      if (!message.toLowerCase().includes("not found")) {
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

  verifyWebhook(body: Buffer, authorization: string | undefined): unknown {
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

export function parseCallIdFromRoomName(roomName: string): string | null {
  const prefix = "call-";
  if (!roomName.startsWith(prefix)) {
    return null;
  }

  const callId = roomName.slice(prefix.length);
  return callId.length > 0 ? callId : null;
}

export { roomNameForCall, toWsUrl };
