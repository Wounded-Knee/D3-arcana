import { describe, expect, it, vi } from "vitest";

vi.mock("livekit-server-sdk", () => {
  class AccessToken {
    constructor(
      public apiKey: string,
      public apiSecret: string,
      public options: Record<string, unknown>,
    ) {}

    addGrant(_grant: Record<string, unknown>): void {}

    async toJwt(): Promise<string> {
      return "mock-jwt-token";
    }
  }

  class RoomServiceClient {
    createRoom = vi.fn().mockResolvedValue({});
    deleteRoom = vi.fn().mockResolvedValue({});
    listRooms = vi.fn().mockResolvedValue([]);
  }

  class WebhookReceiver {
    receive = vi.fn().mockReturnValue({ event: "participant_joined" });
  }

  return { AccessToken, RoomServiceClient, WebhookReceiver };
});

import {
  LiveKitMediaSessionProvider,
  parseCallIdFromRoomName,
  roomNameForCall,
  toWsUrl,
} from "./livekit-provider.js";

describe("LiveKitMediaSessionProvider", () => {
  const provider = new LiveKitMediaSessionProvider({
    url: "http://127.0.0.1:7880",
    apiKey: "devkey",
    apiSecret: "devsecret",
    webhookSecret: "devsecret",
  });

  it("converts HTTP URL to WS for clients", () => {
    expect(toWsUrl("http://127.0.0.1:7880")).toBe("ws://127.0.0.1:7880");
    expect(toWsUrl("ws://example.com:7880")).toBe("ws://example.com:7880");
  });

  it("builds room names from call ids", () => {
    const callId = "00000000-0000-4000-8000-000000000001";
    expect(roomNameForCall(callId)).toBe(`call-${callId}`);
    expect(parseCallIdFromRoomName(`call-${callId}`)).toBe(callId);
  });

  it("returns publicUrl in join credentials when configured", async () => {
    const lanProvider = new LiveKitMediaSessionProvider({
      url: "http://127.0.0.1:7880",
      publicUrl: "ws://192.168.1.50:7880",
      apiKey: "devkey",
      apiSecret: "devsecret",
      webhookSecret: "devsecret",
    });

    const credentials = await lanProvider.issueJoinCredentials({
      callId: "00000000-0000-4000-8000-000000000010",
      userId: "00000000-0000-4000-8000-000000000011",
      displayName: "Alice",
      role: "publisher",
    });

    expect(credentials.url).toBe("ws://192.168.1.50:7880");
  });

  it("mints join credentials with expected shape", async () => {
    const callId = "00000000-0000-4000-8000-000000000002";
    const credentials = await provider.issueJoinCredentials({
      callId,
      userId: "00000000-0000-4000-8000-000000000003",
      displayName: "Alice",
      role: "publisher",
    });

    expect(credentials.provider).toBe("livekit");
    expect(credentials.url).toBe("ws://127.0.0.1:7880");
    expect(credentials.token).toBe("mock-jwt-token");
    expect(credentials.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("issues subscriber credentials without publish grant side effects", async () => {
    const credentials = await provider.issueJoinCredentials({
      callId: "00000000-0000-4000-8000-000000000004",
      userId: "00000000-0000-4000-8000-000000000005",
      displayName: "Bob",
      role: "subscriber",
    });

    expect(credentials.token).toBe("mock-jwt-token");
  });

  it("reports healthy when listRooms succeeds", async () => {
    await expect(provider.checkHealth()).resolves.toEqual({ ok: true });
  });
});
