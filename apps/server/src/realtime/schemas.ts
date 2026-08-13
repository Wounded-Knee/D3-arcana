import { z } from "zod";

export const conversationJoinSchema = z.object({
  type: z.literal("conversation.join"),
  conversationId: z.uuid(),
});

export const conversationLeaveSchema = z.object({
  type: z.literal("conversation.leave"),
  conversationId: z.uuid(),
});

export const clientMessageSchema = z.discriminatedUnion(
  "type",
  [
    conversationJoinSchema,
    conversationLeaveSchema,
  ],
);

export type ClientMessage = z.infer<
  typeof clientMessageSchema
>;