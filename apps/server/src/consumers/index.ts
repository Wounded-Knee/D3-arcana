import { eventBus } from "../events/event-bus-instance.js";
import { createMessageCreatedWebSocketHandler } from "./message-created-websocket.js";
import { handleMessageCreated } from "./message-created.js";
import type { WebSocketManager } from "../realtime/websocket-manager.js";

export function registerConsumers(
  webSocketManager: WebSocketManager,
): void {
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
}