import { z } from "zod";

export const messageCreatedPayloadSchema = z.object({
  messageId: z.uuid(),
  content: z.string(),
});

export type MessageCreatedPayload = z.infer<
  typeof messageCreatedPayloadSchema
>;

export const messageCreatedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("message.created"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: messageCreatedPayloadSchema,
});

export type MessageCreatedEvent = z.infer<
  typeof messageCreatedEventSchema
>;
