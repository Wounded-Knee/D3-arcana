import type { MessageCreatedEvent } from "@d3-arcana/events";

import {
  hasProcessedEvent,
  markEventProcessed,
} from "../events/consumer-deduplication.js";
import type { WebSocketManager } from "../realtime/websocket-manager.js";

const CONSUMER_NAME = "message-created-websocket-consumer";

export function createMessageCreatedWebSocketHandler(
  manager: WebSocketManager,
) {
  return async function handleMessageCreated(
    event: MessageCreatedEvent,
  ): Promise<void> {
    if (await hasProcessedEvent(CONSUMER_NAME, event.eventId)) {
      console.log(
        `[ws-consumer] already processed ${event.eventId}; skipping`,
      );
      return;
    }

    manager.broadcastToConversation(
      event.conversationId,
      {
        type: "event",
        event: {
          eventId: event.eventId,
          type: event.type,
          timestamp: event.timestamp,
          conversationId: event.conversationId,
          actorId: event.actorId,
          payload: event.payload,
        },
      },
    );

    await markEventProcessed(CONSUMER_NAME, event.eventId);
  };
}
