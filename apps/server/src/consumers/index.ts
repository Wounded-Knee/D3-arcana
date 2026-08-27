import { eventBus } from "../events/event-bus-instance.js";
import { createAnnotationEventsWebSocketHandler } from "./annotation-events-websocket.js";
import { createCallEventsWebSocketHandler } from "./call-events-websocket.js";
import { createMessageCreatedWebSocketHandler } from "./message-created-websocket.js";
import { handleMessageCreated } from "./message-created.js";
import type { WebSocketManager } from "../realtime/websocket-manager.js";

export function registerConsumers(
  webSocketManager: WebSocketManager,
): void {
  const callHandlers = createCallEventsWebSocketHandler(
    webSocketManager,
  );

  eventBus.subscribe(
    "message.created",
    handleMessageCreated,
  );

  eventBus.subscribe(
    "message.created",
    createMessageCreatedWebSocketHandler(
      webSocketManager,
    ),
  );

  eventBus.subscribe("call.started", callHandlers.handleCallStarted);
  eventBus.subscribe(
    "call.participant.joined",
    callHandlers.handleCallParticipantJoined,
  );
  eventBus.subscribe(
    "call.participant.left",
    callHandlers.handleCallParticipantLeft,
  );
  eventBus.subscribe("call.ended", callHandlers.handleCallEnded);
  eventBus.subscribe(
    "call.recording.started",
    callHandlers.handleCallRecordingStarted,
  );
  eventBus.subscribe(
    "call.recording.completed",
    callHandlers.handleCallRecordingCompleted,
  );
  eventBus.subscribe(
    "call.recording.failed",
    callHandlers.handleCallRecordingFailed,
  );
  eventBus.subscribe(
    "call.recording.restored",
    callHandlers.handleCallRecordingRestored,
  );

  const annotationHandlers = createAnnotationEventsWebSocketHandler(
    webSocketManager,
  );
  eventBus.subscribe(
    "annotation.created",
    annotationHandlers.handleAnnotationCreated,
  );
  eventBus.subscribe(
    "annotation.updated",
    annotationHandlers.handleAnnotationUpdated,
  );
  eventBus.subscribe(
    "annotation.deleted",
    annotationHandlers.handleAnnotationDeleted,
  );
  eventBus.subscribe(
    "selection.created",
    annotationHandlers.handleSelectionCreated,
  );
  eventBus.subscribe(
    "selection.updated",
    annotationHandlers.handleSelectionUpdated,
  );
  eventBus.subscribe(
    "selection.deleted",
    annotationHandlers.handleSelectionDeleted,
  );
  eventBus.subscribe(
    "annotation.ratification.updated",
    annotationHandlers.handleRatificationUpdated,
  );
  eventBus.subscribe(
    "annotation.ratification.resolved",
    annotationHandlers.handleRatificationResolved,
  );
}