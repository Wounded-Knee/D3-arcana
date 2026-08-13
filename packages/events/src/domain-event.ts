import { z } from "zod";

import { messageCreatedEventSchema } from "./message.js";

export const domainEventSchema = z.discriminatedUnion(
  "type",
  [messageCreatedEventSchema],
);

export type DomainEvent = z.infer<typeof domainEventSchema>;

export function parseDomainEvent(raw: unknown): DomainEvent {
  return domainEventSchema.parse(raw);
}
