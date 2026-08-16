import type {
  IssueJoinCredentialsParams,
  IssuedJoinCredentials,
  MediaHealth,
  MediaSessionProvider,
  PublishedAudioTrack,
  StartedTrackRecording,
  StartTrackRecordingParams,
} from "./types.js";

export class MockMediaSessionProvider implements MediaSessionProvider {
  readonly ensureRoomCalls: string[] = [];
  readonly endRoomCalls: string[] = [];
  readonly startTrackRecordingCalls: StartTrackRecordingParams[] = [];
  readonly stopTrackRecordingCalls: string[] = [];
  readonly stopRecordingsForCallCalls: string[] = [];
  healthResult: MediaHealth = { ok: true };
  startTrackRecordingError: Error | null = null;
  publishedTracks: PublishedAudioTrack[] = [];
  webhookEvent: unknown = { event: "test" };
  nextEgressId = 1;

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

  async startTrackRecording(
    params: StartTrackRecordingParams,
  ): Promise<StartedTrackRecording> {
    this.startTrackRecordingCalls.push(params);

    if (this.startTrackRecordingError) {
      throw this.startTrackRecordingError;
    }

    const egressId = `EG_${this.nextEgressId}`;
    this.nextEgressId += 1;
    return { egressId };
  }

  async stopTrackRecording(egressId: string): Promise<void> {
    this.stopTrackRecordingCalls.push(egressId);
  }

  async stopRecordingsForCall(callId: string): Promise<void> {
    this.stopRecordingsForCallCalls.push(callId);
  }

  async listPublishedAudioTracks(
    _callId: string,
  ): Promise<PublishedAudioTrack[]> {
    return this.publishedTracks;
  }

  async verifyWebhook(
    _body: Buffer,
    _authorization: string | undefined,
  ): Promise<unknown> {
    return this.webhookEvent;
  }

  async checkHealth(): Promise<MediaHealth> {
    return this.healthResult;
  }
}
