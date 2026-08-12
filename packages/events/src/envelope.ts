export interface EventEnvelope<
  TType extends string,
  TPayload,
> {
  eventId: string;
  type: TType;
  timestamp: string;
  conversationId: string;
  actorId: string;
  payload: TPayload;
}