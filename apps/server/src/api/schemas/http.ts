import { z } from "zod";

export const createUserSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
});

export const createConversationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  createdBy: z.uuid(),
});

export const createMessageSchema = z.object({
  senderId: z.uuid(),
  content: z.string().trim().min(1).max(10_000),
});