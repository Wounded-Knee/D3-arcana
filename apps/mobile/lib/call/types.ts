export type CallParticipantInfo = {
  identity: string;
  name?: string;
  isMuted: boolean;
};

export type CallSessionListener = {
  onParticipantsChanged?: (participants: CallParticipantInfo[]) => void;
  onConnectionStateChanged?: (connected: boolean) => void;
  onLocalAudioLevel?: (level: number) => void;
  onError?: (error: Error) => void;
};

export interface CallSession {
  connect(url: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  isMuted(): boolean;
  getParticipants(): CallParticipantInfo[];
  addListener(listener: CallSessionListener): () => void;
}
