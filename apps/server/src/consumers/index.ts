import { eventBus } from "../events/event-bus-instance.js";
import { handleMessageCreated } from "./message-created.js";

export function registerConsumers(): void {
  eventBus.subscribe(
    "message.created",
    handleMessageCreated,
  );
}