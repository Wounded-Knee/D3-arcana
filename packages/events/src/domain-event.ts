import { z } from "zod";

import {
  callEndedEventSchema,
  callParticipantJoinedEventSchema,
  callParticipantLeftEventSchema,
  callRecordingCompletedEventSchema,
  callRecordingFailedEventSchema,
  callRecordingRestoredEventSchema,
  callRecordingStartedEventSchema,
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
    callRecordingStartedEventSchema,
    callRecordingCompletedEventSchema,
    callRecordingFailedEventSchema,
    callRecordingRestoredEventSchema,
  ],
);

export type DomainEvent = z.infer<typeof domainEventSchema>;

export function parseDomainEvent(raw: unknown): DomainEvent {
  return domainEventSchema.parse(raw);
}
