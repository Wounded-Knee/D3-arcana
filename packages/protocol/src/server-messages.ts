import {
  domainEventSchema,
  messageCreatedEventSchema,
  messageCreatedPayloadSchema,
  type DomainEvent,
  type MessageCreatedEvent,
} from "@d3-arcana/events";
import { z } from "zod";

export {
  domainEventSchema,
  messageCreatedEventSchema,
  messageCreatedPayloadSchema,
};

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

export const eventMessageSchema = z.object({
  type: z.literal("event"),
  event: domainEventSchema,
});

export const callWaveformChunkMessageSchema = z.object({
  type: z.literal("call.waveform.chunk"),
  conversationId: z.uuid(),
  callId: z.uuid(),
  userId: z.uuid(),
  startOffsetMs: z.number().int().nonnegative(),
  sampleRateHz: z.number().int().positive(),
  amplitudes: z.array(z.number().int().min(0).max(255)).max(20),
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
    callWaveformChunkMessageSchema,
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
export type MessageCreatedWireEvent = MessageCreatedEvent;
export type DomainWireEvent = DomainEvent;
export type EventMessage = z.infer<typeof eventMessageSchema>;
export type CallWaveformChunkMessage = z.infer<
  typeof callWaveformChunkMessageSchema
>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
