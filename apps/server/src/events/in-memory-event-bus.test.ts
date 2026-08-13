import { describe, expect, it, vi } from "vitest";

import type { MessageCreatedEvent } from "@d3-arcana/events";

import { InMemoryEventBus } from "./in-memory-event-bus.js";

function createEvent(
  overrides: Partial<MessageCreatedEvent> = {},
): MessageCreatedEvent {
  return {
    eventId: "11111111-1111-4111-8111-111111111111",
    type: "message.created",
    timestamp: "2026-08-13T00:00:00.000Z",
    conversationId: "22222222-2222-4222-8222-222222222222",
    actorId: "33333333-3333-4333-8333-333333333333",
    payload: {
      messageId: "44444444-4444-4444-8444-444444444444",
      content: "Hello",
    },
    ...overrides,
  };
}

describe("InMemoryEventBus", () => {
  it("stores published events and invokes subscribed handlers", async () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn(async () => undefined);
    const event = createEvent();

    bus.subscribe("message.created", handler);
    await bus.publish(event);

    expect(bus.getEvents()).toEqual([event]);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not invoke handlers for other event types", async () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn(async () => undefined);

    bus.subscribe("message.created", handler);
    await bus.publish(
      createEvent({ eventId: "55555555-5555-4555-8555-555555555555" }),
    );

    expect(handler).toHaveBeenCalledOnce();
  });
});
