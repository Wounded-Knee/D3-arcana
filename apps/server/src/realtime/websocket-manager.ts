import { WebSocket } from "ws";

import {
  serializeServerMessage,
  type ServerMessage,
} from "@d3-arcana/protocol";

import type { AuthenticatedUser } from "../auth/types.js";

export class WebSocketManager {
  private readonly clients = new Set<WebSocket>();

  private readonly subscriptions = new Map<
    string,
    Set<WebSocket>
  >();

  private readonly authenticatedUsers = new WeakMap<
    WebSocket,
    AuthenticatedUser
  >();

  add(socket: WebSocket): void {
    this.clients.add(socket);

    socket.on("close", () => {
      this.remove(socket);
    });
  }

  remove(socket: WebSocket): void {
    this.clients.delete(socket);

    for (const subscribers of this.subscriptions.values()) {
      subscribers.delete(socket);
    }

    for (const [conversationId, subscribers] of this.subscriptions) {
      if (subscribers.size === 0) {
        this.subscriptions.delete(conversationId);
      }
    }
  }

  subscribe(
    socket: WebSocket,
    conversationId: string,
  ): void {
    let subscribers =
      this.subscriptions.get(conversationId);

    if (!subscribers) {
      subscribers = new Set<WebSocket>();

      this.subscriptions.set(
        conversationId,
        subscribers,
      );
    }

    subscribers.add(socket);
  }

  unsubscribe(
    socket: WebSocket,
    conversationId: string,
  ): void {
    const subscribers =
      this.subscriptions.get(conversationId);

    if (!subscribers) {
      return;
    }

    subscribers.delete(socket);

    if (subscribers.size === 0) {
      this.subscriptions.delete(conversationId);
    }
  }

  broadcastToConversation(
    conversationId: string,
    message: ServerMessage,
  ): void {
    const subscribers =
      this.subscriptions.get(conversationId);

    if (!subscribers) {
      return;
    }

    let payload: string;

    try {
      payload = serializeServerMessage(message);
    } catch (error) {
      console.error(
        "[ws] invalid broadcast message:",
        error,
      );
      return;
    }

    for (const client of subscribers) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  getSubscriptionCount(
    conversationId: string,
  ): number {
    return (
      this.subscriptions.get(conversationId)?.size ?? 0
    );
  }

  setAuthenticatedUser(
    socket: WebSocket,
    user: AuthenticatedUser,
  ): void {
    this.authenticatedUsers.set(socket, user);
  }

  getAuthenticatedUser(
    socket: WebSocket,
  ): AuthenticatedUser | null {
    return this.authenticatedUsers.get(socket) ?? null;
  }
}
