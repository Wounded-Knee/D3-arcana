import { z } from "zod";

import {
  callEndedEventSchema,
  callParticipantJoinedEventSchema,
  callParticipantLeftEventSchema,
  callStartedEventSchema,
} from "./call.js";
import { messageCreatedEventSchema } from "./message.js";

export const domainEventSchema = z.discriminatedUnion(
  "type",
  [
    messageCreatedEventSchema,
    callStartedEventSchema,
    callParticipantJoinedEventSchema,
    callParticipantLeftEventSchema,
    callEndedEventSchema,
  ],
);

export type DomainEvent = z.infer<typeof domainEventSchema>;

export function parseDomainEvent(raw: unknown): DomainEvent {
  return domainEventSchema.parse(raw);
}
