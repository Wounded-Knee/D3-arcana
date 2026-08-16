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
import { startAudioLevelLoop } from './audio-level-loop';

export class WebCallSession implements CallSession {
  private room: Room | null = null;
  private muted = false;
  private remoteMuted = false;
  private listeners = new Set<CallSessionListener>();
  private stopAudioLevelLoop: (() => void) | null = null;

  async connect(url: string, token: string): Promise<void> {
    await this.disconnect();

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      this.applyRemoteMute();
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
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      this.notifyConnection(state === ConnectionState.Connected);
    });

    await room.connect(url, token);
    await room.localParticipant.setMicrophoneEnabled(true);
    this.muted = false;
    this.remoteMuted = false;
    this.room = room;
    this.startAudioLevels();
    this.notifyConnection(true);
    this.notifyParticipants();
  }

  async disconnect(): Promise<void> {
    this.stopAudioLevels();

    if (!this.room) {
      return;
    }

    const room = this.room;
    this.room = null;
    this.muted = false;
    this.remoteMuted = false;
    await room.disconnect();
    this.notifyConnection(false);
    this.notifyParticipants();
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room) {
      return;
    }

    await this.room.localParticipant.setMicrophoneEnabled(!muted);
    this.muted = muted;
    this.notifyParticipants();
  }

  async setSpeakerphone(_enabled: boolean): Promise<void> {}

  setRemoteAudioMuted(muted: boolean): void {
    this.remoteMuted = muted;
    this.applyRemoteMute();
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

  private applyRemoteMute(): void {
    if (!this.room) {
      return;
    }

    const volume = this.remoteMuted ? 0 : 1;
    for (const participant of this.room.remoteParticipants.values()) {
      participant.setVolume(volume);
    }
  }

  private startAudioLevels(): void {
    this.stopAudioLevels();
    this.stopAudioLevelLoop = startAudioLevelLoop(
      () => (this.muted ? 0 : (this.room?.localParticipant.audioLevel ?? 0)),
      this.listeners,
    );
  }

  private stopAudioLevels(): void {
    this.stopAudioLevelLoop?.();
    this.stopAudioLevelLoop = null;
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
  return new WebCallSession();
}
