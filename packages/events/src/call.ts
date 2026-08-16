import { z } from "zod";

export const callMediaModeSchema = z.enum(["audio", "video"]);
export const callParticipantRoleSchema = z.enum(["publisher", "subscriber"]);

export const callStartedPayloadSchema = z.object({
  callId: z.uuid(),
  mediaMode: callMediaModeSchema,
});

export type CallStartedPayload = z.infer<typeof callStartedPayloadSchema>;

export const callStartedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("call.started"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: callStartedPayloadSchema,
});

export type CallStartedEvent = z.infer<typeof callStartedEventSchema>;

export const callParticipantJoinedPayloadSchema = z.object({
  callId: z.uuid(),
  userId: z.uuid(),
  role: callParticipantRoleSchema,
});

export type CallParticipantJoinedPayload = z.infer<
  typeof callParticipantJoinedPayloadSchema
>;

export const callParticipantJoinedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("call.participant.joined"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: callParticipantJoinedPayloadSchema,
});

export type CallParticipantJoinedEvent = z.infer<
  typeof callParticipantJoinedEventSchema
>;

export const callParticipantLeftPayloadSchema = z.object({
  callId: z.uuid(),
  userId: z.uuid(),
});

export type CallParticipantLeftPayload = z.infer<
  typeof callParticipantLeftPayloadSchema
>;

export const callParticipantLeftEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("call.participant.left"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: callParticipantLeftPayloadSchema,
});

export type CallParticipantLeftEvent = z.infer<
  typeof callParticipantLeftEventSchema
>;

export const callEndedPayloadSchema = z.object({
  callId: z.uuid(),
  reason: z.string().optional(),
});

export type CallEndedPayload = z.infer<typeof callEndedPayloadSchema>;

export const callEndedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("call.ended"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: callEndedPayloadSchema,
});

export type CallEndedEvent = z.infer<typeof callEndedEventSchema>;

export const callRecordingStartedPayloadSchema = z.object({
  callId: z.uuid(),
  userId: z.uuid(),
  recordingId: z.uuid(),
  objectKey: z.string().min(1),
  callOffsetMs: z.number().int().nonnegative(),
});

export type CallRecordingStartedPayload = z.infer<
  typeof callRecordingStartedPayloadSchema
>;

export const callRecordingStartedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("call.recording.started"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: callRecordingStartedPayloadSchema,
});

export type CallRecordingStartedEvent = z.infer<
  typeof callRecordingStartedEventSchema
>;

export const callRecordingCompletedPayloadSchema = z.object({
  callId: z.uuid(),
  userId: z.uuid(),
  recordingId: z.uuid(),
  objectKey: z.string().min(1),
  callOffsetMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

export type CallRecordingCompletedPayload = z.infer<
  typeof callRecordingCompletedPayloadSchema
>;

export const callRecordingCompletedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("call.recording.completed"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: callRecordingCompletedPayloadSchema,
});

export type CallRecordingCompletedEvent = z.infer<
  typeof callRecordingCompletedEventSchema
>;

export const callRecordingFailedPayloadSchema = z.object({
  callId: z.uuid(),
  userId: z.uuid(),
  recordingId: z.uuid(),
  error: z.string().min(1),
});

export type CallRecordingFailedPayload = z.infer<
  typeof callRecordingFailedPayloadSchema
>;

export const callRecordingFailedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("call.recording.failed"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: callRecordingFailedPayloadSchema,
});

export type CallRecordingFailedEvent = z.infer<
  typeof callRecordingFailedEventSchema
>;

export const callRecordingRestoredPayloadSchema = z.object({
  callId: z.uuid(),
  userId: z.uuid(),
  recordingId: z.uuid(),
  objectKey: z.string().min(1),
  callOffsetMs: z.number().int().nonnegative(),
  previousRecordingId: z.uuid(),
});

export type CallRecordingRestoredPayload = z.infer<
  typeof callRecordingRestoredPayloadSchema
>;

export const callRecordingRestoredEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("call.recording.restored"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: callRecordingRestoredPayloadSchema,
});

export type CallRecordingRestoredEvent = z.infer<
  typeof callRecordingRestoredEventSchema
>;
