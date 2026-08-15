import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';

import type {
  CallParticipantInfo,
  CallSession,
  CallSessionListener,
} from './types';

function livekitNative(): typeof import('@livekit/react-native') {
  // Expo Go has no native module — keep this lazy so chat still loads there.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@livekit/react-native') as typeof import('@livekit/react-native');
}

export class NativeCallSession implements CallSession {
  private room: Room | null = null;
  private muted = false;
  private audioSessionStarted = false;
  private listeners = new Set<CallSessionListener>();

  async connect(url: string, token: string): Promise<void> {
    await this.disconnect();

    await livekitNative().AudioSession.startAudioSession();
    this.audioSessionStarted = true;

    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        this.notifyParticipants();
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        this.notifyParticipants();
      });
      room.on(RoomEvent.TrackMuted, () => {
        this.notifyParticipants();
      });
      room.on(RoomEvent.TrackUnmuted, () => {
        this.notifyParticipants();
      });
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        this.notifyConnection(state === ConnectionState.Connected);
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      this.muted = false;
      this.room = room;
      this.notifyConnection(true);
      this.notifyParticipants();
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.muted = false;

    if (room) {
      await room.disconnect();
      this.notifyConnection(false);
      this.notifyParticipants();
    }

    if (this.audioSessionStarted) {
      this.audioSessionStarted = false;
      await livekitNative().AudioSession.stopAudioSession();
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room) {
      return;
    }

    await this.room.localParticipant.setMicrophoneEnabled(!muted);
    this.muted = muted;
    this.notifyParticipants();
  }

  isMuted(): boolean {
    return this.muted;
  }

  getParticipants(): CallParticipantInfo[] {
    if (!this.room) {
      return [];
    }

    const participants: CallParticipantInfo[] = [
      {
        identity: this.room.localParticipant.identity,
        name: this.room.localParticipant.name,
        isMuted: this.muted,
      },
    ];

    for (const participant of this.room.remoteParticipants.values()) {
      const audioPublication = participant.getTrackPublication(
        Track.Source.Microphone,
      );

      participants.push({
        identity: participant.identity,
        name: participant.name,
        isMuted: audioPublication?.isMuted ?? !audioPublication?.track,
      });
    }

    return participants;
  }

  addListener(listener: CallSessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyParticipants(): void {
    const participants = this.getParticipants();
    for (const listener of this.listeners) {
      listener.onParticipantsChanged?.(participants);
    }
  }

  private notifyConnection(connected: boolean): void {
    for (const listener of this.listeners) {
      listener.onConnectionStateChanged?.(connected);
    }
  }
}

export function createCallSession(): CallSession {
  return new NativeCallSession();
}
