import type {
  AnnotationCreatedEvent,
  AnnotationDeletedEvent,
  AnnotationUpdatedEvent,
  DomainEvent,
  SelectionCreatedEvent,
  SelectionDeletedEvent,
  SelectionUpdatedEvent,
} from "@d3-arcana/events";

import {
  hasProcessedEvent,
  markEventProcessed,
} from "../events/consumer-deduplication.js";
import type { WebSocketManager } from "../realtime/websocket-manager.js";

const CONSUMER_NAME = "annotation-events-websocket-consumer";

async function broadcastAnnotationEvent(
  manager: WebSocketManager,
  event: DomainEvent,
): Promise<void> {
  if (await hasProcessedEvent(CONSUMER_NAME, event.eventId)) {
    console.log(
      `[ws-consumer] already processed ${event.eventId}; skipping`,
    );
    return;
  }

  manager.broadcastToConversation(event.conversationId, {
    type: "event",
    event,
  });

  await markEventProcessed(CONSUMER_NAME, event.eventId);
}

export function createAnnotationEventsWebSocketHandler(
  manager: WebSocketManager,
) {
  return {
    handleAnnotationCreated: (event: AnnotationCreatedEvent) =>
      broadcastAnnotationEvent(manager, event),
    handleAnnotationUpdated: (event: AnnotationUpdatedEvent) =>
      broadcastAnnotationEvent(manager, event),
    handleAnnotationDeleted: (event: AnnotationDeletedEvent) =>
      broadcastAnnotationEvent(manager, event),
    handleSelectionCreated: (event: SelectionCreatedEvent) =>
      broadcastAnnotationEvent(manager, event),
    handleSelectionUpdated: (event: SelectionUpdatedEvent) =>
      broadcastAnnotationEvent(manager, event),
    handleSelectionDeleted: (event: SelectionDeletedEvent) =>
      broadcastAnnotationEvent(manager, event),
  };
}
