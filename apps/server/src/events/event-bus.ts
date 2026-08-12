import type { MessageCreatedEvent } from "@d3-arcana/events";

export type DomainEvent = MessageCreatedEvent;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
}