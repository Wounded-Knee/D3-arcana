import type { MessageCreatedEvent } from "@d3-arcana/events";

import type { WebSocketManager } from "../realtime/websocket-manager.js";

export function createMessageCreatedWebSocketHandler(
  manager: WebSocketManager,
) {
  return async function handleMessageCreated(
    event: MessageCreatedEvent,
  ): Promise<void> {
    manager.broadcastToConversation(
      event.conversationId,
      {
        type: event.type,
        eventId: event.eventId,
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        actorId: event.actorId,
        payload: event.payload,
      },
    );
  };
}