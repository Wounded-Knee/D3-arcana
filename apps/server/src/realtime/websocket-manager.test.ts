import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import WebSocket from "ws";

import type { ServerMessage } from "@d3-arcana/protocol";

import { WebSocketManager } from "./websocket-manager.js";

interface MockWebSocket extends WebSocket {
  sent: string[];
}

function createMockSocket(): MockWebSocket {
  const emitter = new EventEmitter();
  const socket = {
    readyState: WebSocket.OPEN as number,
    sent: [] as string[],
    send(payload: string) {
      this.sent.push(payload);
    },
    close() {
      this.readyState = WebSocket.CLOSED;
      emitter.emit("close");
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      emitter.on(event, listener);
      return this;
    },
  };

  return socket as MockWebSocket;
}

describe("WebSocketManager", () => {
  it("tracks subscriptions and broadcasts only to joined clients", () => {
    const manager = new WebSocketManager();
    const alice = createMockSocket();
    const bob = createMockSocket();
    const conversationId = "11111111-1111-4111-8111-111111111111";

    manager.add(alice);
    manager.add(bob);
    manager.subscribe(alice, conversationId);

    const message: ServerMessage = {
      type: "conversation.joined",
      conversationId,
    };

    manager.broadcastToConversation(conversationId, message);

    expect(manager.getSubscriptionCount(conversationId)).toBe(1);
    expect(alice.sent).toHaveLength(1);
    expect(bob.sent).toHaveLength(0);
  });

  it("stores authenticated users per socket", () => {
    const manager = new WebSocketManager();
    const socket = createMockSocket();

    manager.add(socket);
    manager.setAuthenticatedUser(socket, {
      userId: "11111111-1111-4111-8111-111111111111",
      displayName: "Alice",
    });

    expect(manager.getAuthenticatedUser(socket)).toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      displayName: "Alice",
    });
  });

  it("cleans up subscriptions when a socket closes", () => {
    const manager = new WebSocketManager();
    const socket = createMockSocket();
    const conversationId = "22222222-2222-4222-8222-222222222222";

    manager.add(socket);
    manager.subscribe(socket, conversationId);
    socket.close();

    expect(manager.clientCount).toBe(0);
    expect(manager.getSubscriptionCount(conversationId)).toBe(0);
  });
});
