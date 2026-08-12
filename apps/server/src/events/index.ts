import { InMemoryEventBus } from "./in-memory-event-bus.js";

export const eventBus = new InMemoryEventBus();

export * from "./event-bus.js";
export * from "./outbox-publisher.js";
