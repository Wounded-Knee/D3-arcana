import type {
  IssueJoinCredentialsParams,
  IssuedJoinCredentials,
  MediaHealth,
  MediaSessionProvider,
} from "./types.js";

export class MockMediaSessionProvider implements MediaSessionProvider {
  readonly ensureRoomCalls: string[] = [];
  readonly endRoomCalls: string[] = [];
  healthResult: MediaHealth = { ok: true };

  async ensureRoom(callId: string): Promise<void> {
    this.ensureRoomCalls.push(callId);
  }

  async endRoom(callId: string): Promise<void> {
    this.endRoomCalls.push(callId);
  }

  async issueJoinCredentials(
    params: IssueJoinCredentialsParams,
  ): Promise<IssuedJoinCredentials> {
    return {
      provider: "livekit",
      url: "ws://127.0.0.1:7880",
      token: `mock-token-${params.callId}-${params.userId}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
  }

  verifyWebhook(_body: Buffer, _authorization: string | undefined): unknown {
    return { event: "test" };
  }

  async checkHealth(): Promise<MediaHealth> {
    return this.healthResult;
  }
}
