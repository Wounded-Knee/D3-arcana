import type { DomainEvent } from '@d3-arcana/events';
import {
  parseServerMessage,
  type CallCatchupSafeToJoinLiveMessage,
  type CallRecordingFragmentMessage,
  type CallWaveformChunkMessage,
  type ClientMessage,
} from '@d3-arcana/protocol';

import { getWsBaseUrl } from './config';

export type RealtimeEventHandler = (event: DomainEvent) => void;
export type WaveformChunkHandler = (chunk: CallWaveformChunkMessage) => void;
export type RecordingFragmentHandler = (
  fragment: CallRecordingFragmentMessage,
) => void;
export type CatchupSafeHandler = (
  message: CallCatchupSafeToJoinLiveMessage,
) => void;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private authenticated = false;
  private joinedConversations = new Set<string>();
  private eventHandlers = new Set<RealtimeEventHandler>();
  private waveformHandlers = new Set<WaveformChunkHandler>();
  private fragmentHandlers = new Set<RecordingFragmentHandler>();
  private catchupHandlers = new Set<CatchupSafeHandler>();

  constructor(private readonly token: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(getWsBaseUrl());

      this.socket.onopen = () => {
        this.send({ type: 'auth.authenticate', token: this.token });
      };

      this.socket.onmessage = (event) => {
        const message = parseServerMessage(String(event.data));
        if (!message) {
          return;
        }

        switch (message.type) {
          case 'auth.authenticated':
            this.authenticated = true;
            resolve();
            break;
          case 'error':
            if (!this.authenticated) {
              reject(new Error(message.error));
            }
            break;
          case 'event':
            for (const handler of this.eventHandlers) {
              handler(message.event);
            }
            break;
          case 'call.waveform.chunk':
            for (const handler of this.waveformHandlers) {
              handler(message);
            }
            break;
          case 'call.recording.fragment':
            for (const handler of this.fragmentHandlers) {
              handler(message);
            }
            break;
          case 'call.catchup.safeToJoinLive':
            for (const handler of this.catchupHandlers) {
              handler(message);
            }
            break;
          default:
            break;
        }
      };

      this.socket.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };

      this.socket.onclose = () => {
        this.authenticated = false;
        this.joinedConversations.clear();
      };
    });
  }

  onEvent(handler: RealtimeEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  onWaveformChunk(handler: WaveformChunkHandler): () => void {
    this.waveformHandlers.add(handler);
    return () => {
      this.waveformHandlers.delete(handler);
    };
  }

  onRecordingFragment(handler: RecordingFragmentHandler): () => void {
    this.fragmentHandlers.add(handler);
    return () => {
      this.fragmentHandlers.delete(handler);
    };
  }

  onCatchupSafeToJoinLive(handler: CatchupSafeHandler): () => void {
    this.catchupHandlers.add(handler);
    return () => {
      this.catchupHandlers.delete(handler);
    };
  }

  joinConversation(conversationId: string): void {
    if (!this.authenticated || this.joinedConversations.has(conversationId)) {
      return;
    }

    this.joinedConversations.add(conversationId);
    this.send({ type: 'conversation.join', conversationId });
  }

  leaveConversation(conversationId: string): void {
    if (!this.joinedConversations.has(conversationId)) {
      return;
    }

    this.joinedConversations.delete(conversationId);
    this.send({ type: 'conversation.leave', conversationId });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.authenticated = false;
    this.joinedConversations.clear();
    this.eventHandlers.clear();
    this.waveformHandlers.clear();
    this.fragmentHandlers.clear();
    this.catchupHandlers.clear();
  }

  private send(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }
}
