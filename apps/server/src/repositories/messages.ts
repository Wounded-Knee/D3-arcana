import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../database.js";
import { messages, outboxEvents } from "../db/schema.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid before cursor");
    this.name = "InvalidCursorError";
  }
}

export interface GetMessagesOptions {
  limit?: number;
  before?: string;
}

export interface GetMessagesResult {
  messages: (typeof messages.$inferSelect)[];
  hasMore: boolean;
}

async function resolveCursor(
  before: string,
  conversationId: string,
): Promise<{ createdAt: Date; id: string }> {
  if (UUID_RE.test(before)) {
    const [message] = await db
      .select({
        createdAt: messages.createdAt,
        id: messages.id,
      })
      .from(messages)
      .where(
        and(
          eq(messages.id, before),
          eq(messages.conversationId, conversationId),
          isNull(messages.deletedAt),
        ),
      )
      .limit(1);

    if (!message) {
      throw new InvalidCursorError();
    }

    return message;
  }

  const parsedDate = new Date(before);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new InvalidCursorError();
  }

  return {
    createdAt: parsedDate,
    id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
  };
}

export async function createMessage(
  conversationId: string,
  senderId: string,
  content: string,
) {
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderId,
        content,
      })
      .returning();

    await tx.insert(outboxEvents).values({
      type: "message.created",
      aggregateType: "message",
      aggregateId: message.id,
      conversationId,
      actorId: senderId,
      payload: {
        messageId: message.id,
        content: message.content,
      },
    });

    return message;
  });
}

export async function getMessages(
  conversationId: string,
  options: GetMessagesOptions = {},
): Promise<GetMessagesResult> {
  const limit = options.limit ?? 50;

  const conditions = [
    eq(messages.conversationId, conversationId),
    isNull(messages.deletedAt),
  ];

  if (options.before) {
    const cursor = await resolveCursor(options.before, conversationId);

    conditions.push(
      or(
        lt(messages.createdAt, cursor.createdAt),
        and(
          eq(messages.createdAt, cursor.createdAt),
          lt(messages.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    messages: page.reverse(),
    hasMore,
  };
}
