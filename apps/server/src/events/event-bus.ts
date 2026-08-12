import type { MessageCreatedEvent } from "@d3-arcana/events";

export type DomainEvent = MessageCreatedEvent;

export type EventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;

  subscribe<TType extends DomainEvent["type"]>(
    type: TType,
    handler: EventHandler<Extract<DomainEvent, { type: TType }>>,
  ): void;
}