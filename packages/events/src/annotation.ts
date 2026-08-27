import { z } from "zod";

export const annotationProfileSnapshotSchema = z.object({
  id: z.uuid(),
  key: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  icon: z.string().min(1),
});

export type AnnotationProfileSnapshot = z.infer<
  typeof annotationProfileSnapshotSchema
>;

export const annotationActorSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1),
});

const annotationLocationSchema = {
  annotationId: z.uuid(),
  callId: z.uuid(),
  profile: annotationProfileSnapshotSchema,
  note: z.string().nullable(),
  startOffsetMs: z.number().int().nonnegative(),
  endOffsetMs: z.number().int().nonnegative(),
  userId: z.uuid().nullable(),
  selectionId: z.uuid().nullable(),
  createdBy: annotationActorSchema,
};

export const annotationCreatedPayloadSchema = z.object(annotationLocationSchema);

export type AnnotationCreatedPayload = z.infer<
  typeof annotationCreatedPayloadSchema
>;

export const annotationCreatedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("annotation.created"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: annotationCreatedPayloadSchema,
});

export type AnnotationCreatedEvent = z.infer<
  typeof annotationCreatedEventSchema
>;

export const annotationUpdatedPayloadSchema = z.object(annotationLocationSchema);

export type AnnotationUpdatedPayload = z.infer<
  typeof annotationUpdatedPayloadSchema
>;

export const annotationUpdatedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("annotation.updated"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: annotationUpdatedPayloadSchema,
});

export type AnnotationUpdatedEvent = z.infer<
  typeof annotationUpdatedEventSchema
>;

export const annotationDeletedPayloadSchema = z.object({
  annotationId: z.uuid(),
  callId: z.uuid(),
});

export type AnnotationDeletedPayload = z.infer<
  typeof annotationDeletedPayloadSchema
>;

export const annotationDeletedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("annotation.deleted"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: annotationDeletedPayloadSchema,
});

export type AnnotationDeletedEvent = z.infer<
  typeof annotationDeletedEventSchema
>;

const selectionLocationSchema = {
  selectionId: z.uuid(),
  callId: z.uuid(),
  startOffsetMs: z.number().int().nonnegative(),
  endOffsetMs: z.number().int().nonnegative(),
  userId: z.uuid().nullable(),
};

export const selectionCreatedPayloadSchema = z.object(selectionLocationSchema);

export type SelectionCreatedPayload = z.infer<
  typeof selectionCreatedPayloadSchema
>;

export const selectionCreatedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("selection.created"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: selectionCreatedPayloadSchema,
});

export type SelectionCreatedEvent = z.infer<
  typeof selectionCreatedEventSchema
>;

export const selectionUpdatedPayloadSchema = z.object(selectionLocationSchema);

export type SelectionUpdatedPayload = z.infer<
  typeof selectionUpdatedPayloadSchema
>;

export const selectionUpdatedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("selection.updated"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: selectionUpdatedPayloadSchema,
});

export type SelectionUpdatedEvent = z.infer<
  typeof selectionUpdatedEventSchema
>;

export const selectionDeletedPayloadSchema = z.object({
  selectionId: z.uuid(),
  callId: z.uuid(),
});

export type SelectionDeletedPayload = z.infer<
  typeof selectionDeletedPayloadSchema
>;

export const selectionDeletedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("selection.deleted"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: selectionDeletedPayloadSchema,
});

export type SelectionDeletedEvent = z.infer<
  typeof selectionDeletedEventSchema
>;

export const ratificationTalliesSchema = z.object({
  for: z.number().int().nonnegative(),
  against: z.number().int().nonnegative(),
  totalUserCount: z.number().int().nonnegative(),
});

export type RatificationTallies = z.infer<typeof ratificationTalliesSchema>;

export const ratificationSnapshotSchema = z.object({
  modelKey: z.string().min(1),
  for: z.number().int().nonnegative(),
  against: z.number().int().nonnegative(),
  totalUserCount: z.number().int().nonnegative(),
});

export type RatificationSnapshot = z.infer<typeof ratificationSnapshotSchema>;

export const annotationRatificationUpdatedPayloadSchema = z.object({
  annotationId: z.uuid(),
  callId: z.uuid(),
  ratificationId: z.uuid().nullable(),
  voter: annotationActorSchema,
  stance: z.enum(["for", "against"]).nullable(),
  tallies: ratificationTalliesSchema,
});

export type AnnotationRatificationUpdatedPayload = z.infer<
  typeof annotationRatificationUpdatedPayloadSchema
>;

export const annotationRatificationUpdatedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("annotation.ratification.updated"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: annotationRatificationUpdatedPayloadSchema,
});

export type AnnotationRatificationUpdatedEvent = z.infer<
  typeof annotationRatificationUpdatedEventSchema
>;

export const annotationRatificationResolvedPayloadSchema = z.object({
  annotationId: z.uuid(),
  callId: z.uuid(),
  status: z.enum(["ratified", "rejected"]),
  decidedAt: z.string(),
  snapshot: ratificationSnapshotSchema,
});

export type AnnotationRatificationResolvedPayload = z.infer<
  typeof annotationRatificationResolvedPayloadSchema
>;

export const annotationRatificationResolvedEventSchema = z.object({
  eventId: z.uuid(),
  type: z.literal("annotation.ratification.resolved"),
  timestamp: z.string(),
  conversationId: z.uuid(),
  actorId: z.uuid(),
  payload: annotationRatificationResolvedPayloadSchema,
});

export type AnnotationRatificationResolvedEvent = z.infer<
  typeof annotationRatificationResolvedEventSchema
>;
