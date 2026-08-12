import type { EventBus, DomainEvent } from "./event-bus.js";

export class InMemoryEventBus implements EventBus {
  private readonly events: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);

    console.log(
      `[event] ${event.type} ${event.eventId}`,
    );
  }

  getEvents(): readonly DomainEvent[] {
    return this.events;
  }
}