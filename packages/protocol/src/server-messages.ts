import { z } from "zod";

export const PROTOCOL_VERSION = 1;

export const errorCodes = [
  "invalid_message",
  "not_authenticated",
  "authentication_failed",
  "not_a_member",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const connectionReadySchema = z.object({
  type: z.literal("connection.ready"),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  authenticated: z.boolean(),
});

export const authAuthenticatedSchema = z.object({
  type: z.literal("auth.authenticated"),
  userId: z.uuid(),
  displayName: z.string(),
});

export const conversationJoinedSchema = z.object({
  type: z.literal("conversation.joined"),
  conversationId: z.uuid(),
});

export const conversationLeftSchema = z.object({
  type: z.literal("conversation.left"),
  conversationId: z.uuid(),
});

export const errorMessageSchema = z.object({
  type: z.literal("error"),
  code: z.enum(errorCodes),
  error: z.string(),
});

export const messageCreatedPayloadSchema = z.object({
  messageId: z.uuid(),
  content: z.string(),
});

export const messageCreatedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("message.created"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: messageCreatedPayloadSchema,
});

export const domainEventSchema = z.discriminatedUnion(
  "type",
  [messageCreatedEventSchema],
);

export const eventMessageSchema = z.object({
  type: z.literal("event"),
  event: domainEventSchema,
});

export const serverMessageSchema = z.discriminatedUnion(
  "type",
  [
    connectionReadySchema,
    authAuthenticatedSchema,
    conversationJoinedSchema,
    conversationLeftSchema,
    errorMessageSchema,
    eventMessageSchema,
  ],
);

export type ConnectionReadyMessage = z.infer<
  typeof connectionReadySchema
>;
export type AuthAuthenticatedMessage = z.infer<
  typeof authAuthenticatedSchema
>;
export type ConversationJoinedMessage = z.infer<
  typeof conversationJoinedSchema
>;
export type ConversationLeftMessage = z.infer<
  typeof conversationLeftSchema
>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type MessageCreatedWireEvent = z.infer<
  typeof messageCreatedEventSchema
>;
export type DomainWireEvent = z.infer<typeof domainEventSchema>;
export type EventMessage = z.infer<typeof eventMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
