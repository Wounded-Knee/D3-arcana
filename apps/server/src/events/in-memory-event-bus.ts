import type {
  DomainEvent,
  EventBus,
  EventHandler,
} from "./event-bus.js";

export class InMemoryEventBus implements EventBus {
  private readonly events: DomainEvent[] = [];

  private readonly handlers = new Map<
    DomainEvent["type"],
    EventHandler[]
  >();

  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);

    console.log(
      `[event] ${event.type} ${event.eventId}`,
    );

    const handlers = this.handlers.get(event.type) ?? [];

    await Promise.all(
      handlers.map((handler) => handler(event)),
    );
  }

  subscribe<TType extends DomainEvent["type"]>(
    type: TType,
    handler: EventHandler<
      Extract<DomainEvent, { type: TType }>
    >,
  ): void {
    const handlers = this.handlers.get(type) ?? [];

    handlers.push(handler as EventHandler);

    this.handlers.set(type, handlers);
  }

  getEvents(): readonly DomainEvent[] {
    return this.events;
  }
}