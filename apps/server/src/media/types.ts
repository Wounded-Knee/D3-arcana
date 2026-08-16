export type JoinRole = "publisher" | "subscriber";

export type MediaMode = "audio" | "video";

export interface JoinCredentials {
  callId: string;
  provider: "livekit";
  url: string;
  token: string;
  expiresAt: string;
  role: JoinRole;
}

export interface IssueJoinCredentialsParams {
  callId: string;
  userId: string;
  displayName: string;
  role: JoinRole;
}

export interface IssuedJoinCredentials {
  provider: "livekit";
  url: string;
  token: string;
  expiresAt: Date;
}

export interface MediaHealth {
  ok: boolean;
  error?: string;
}

export interface PublishedAudioTrack {
  userId: string;
  trackSid: string;
}

export interface StartTrackRecordingParams {
  callId: string;
  userId: string;
  trackSid: string;
  websocketUrl: string;
}

export interface StartedTrackRecording {
  egressId: string;
}

export interface MediaSessionProvider {
  ensureRoom(callId: string): Promise<void>;
  endRoom(callId: string): Promise<void>;
  issueJoinCredentials(
    params: IssueJoinCredentialsParams,
  ): Promise<IssuedJoinCredentials>;
  startTrackRecording(
    params: StartTrackRecordingParams,
  ): Promise<StartedTrackRecording>;
  stopTrackRecording(egressId: string): Promise<void>;
  stopRecordingsForCall(callId: string): Promise<void>;
  listPublishedAudioTracks(callId: string): Promise<PublishedAudioTrack[]>;
  verifyWebhook(body: Buffer, authorization: string | undefined): unknown;
  checkHealth(): Promise<MediaHealth>;
}
