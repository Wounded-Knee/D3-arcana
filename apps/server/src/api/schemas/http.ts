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

export const userIdParamSchema = z.object({
  userId: z.uuid(),
});

export const conversationIdParamSchema = z.object({
  conversationId: z.uuid(),
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z
    .string()
    .optional()
    .refine(
      (value) => {
        if (value === undefined) {
          return true;
        }

        if (UUID_RE.test(value)) {
          return true;
        }

        return !Number.isNaN(new Date(value).getTime());
      },
      { message: "before must be a valid UUID or ISO date" },
    ),
});
