import type { DomainEvent } from '@d3-arcana/events';
import {
  parseServerMessage,
  type ClientMessage,
} from '@d3-arcana/protocol';

import { getWsBaseUrl } from './config';

export type RealtimeEventHandler = (event: DomainEvent) => void;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private authenticated = false;
  private joinedConversations = new Set<string>();
  private eventHandlers = new Set<RealtimeEventHandler>();

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
  }

  private send(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }
}
