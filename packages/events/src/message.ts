import type { EventEnvelope } from "./envelope.js";

export interface MessageCreatedPayload {
  messageId: string;
  content: string;
}

export type MessageCreatedEvent = EventEnvelope<
  "message.created",
  MessageCreatedPayload
>;