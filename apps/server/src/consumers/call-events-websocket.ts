import type {
  CallEndedEvent,
  CallParticipantJoinedEvent,
  CallParticipantLeftEvent,
  CallRecordingCompletedEvent,
  CallRecordingFailedEvent,
  CallRecordingRestoredEvent,
  CallRecordingStartedEvent,
  CallStartedEvent,
  DomainEvent,
} from "@d3-arcana/events";

import {
  hasProcessedEvent,
  markEventProcessed,
} from "../events/consumer-deduplication.js";
import type { WebSocketManager } from "../realtime/websocket-manager.js";

const CONSUMER_NAME = "call-events-websocket-consumer";

async function broadcastCallEvent(
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

export function createCallEventsWebSocketHandler(
  manager: WebSocketManager,
) {
  return {
    handleCallStarted: (event: CallStartedEvent) =>
      broadcastCallEvent(manager, event),
    handleCallParticipantJoined: (event: CallParticipantJoinedEvent) =>
      broadcastCallEvent(manager, event),
    handleCallParticipantLeft: (event: CallParticipantLeftEvent) =>
      broadcastCallEvent(manager, event),
    handleCallEnded: (event: CallEndedEvent) =>
      broadcastCallEvent(manager, event),
    handleCallRecordingStarted: (event: CallRecordingStartedEvent) =>
      broadcastCallEvent(manager, event),
    handleCallRecordingCompleted: (event: CallRecordingCompletedEvent) =>
      broadcastCallEvent(manager, event),
    handleCallRecordingFailed: (event: CallRecordingFailedEvent) =>
      broadcastCallEvent(manager, event),
    handleCallRecordingRestored: (event: CallRecordingRestoredEvent) =>
      broadcastCallEvent(manager, event),
  };
}
