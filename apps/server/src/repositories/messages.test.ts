import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "../database.js";
import { messages, outboxEvents } from "../db/schema.js";
import { createUser } from "./users.js";
import { createConversation } from "./conversations.js";
import {
  createMessage,
  getMessages,
  InvalidCursorError,
} from "./messages.js";

describe("messages repository", () => {
  async function seedConversation() {
    const user = await createUser("Alice");
    const conversation = await createConversation(
      "General",
      user.id,
    );

    return { user, conversation };
  }

  it("creates a message and an outbox event atomically", async () => {
    const { user, conversation } = await seedConversation();

    const message = await createMessage(
      conversation.id,
      user.id,
      "Hello",
    );

    expect(message.content).toBe("Hello");

    const outboxRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, message.id));

    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].type).toBe("message.created");
    expect(outboxRows[0].payload).toEqual({
      messageId: message.id,
      content: "Hello",
    });
  });

  it("returns messages in ascending order with pagination", async () => {
    const { user, conversation } = await seedConversation();

    const first = await createMessage(
      conversation.id,
      user.id,
      "First",
    );
    const second = await createMessage(
      conversation.id,
      user.id,
      "Second",
    );
    const third = await createMessage(
      conversation.id,
      user.id,
      "Third",
    );

    const page = await getMessages(conversation.id, { limit: 2 });

    expect(page.hasMore).toBe(true);
    expect(page.messages.map((message) => message.id)).toEqual([
      second.id,
      third.id,
    ]);

    const earlierPage = await getMessages(conversation.id, {
      limit: 2,
      before: second.id,
    });

    expect(earlierPage.hasMore).toBe(false);
    expect(earlierPage.messages.map((message) => message.id)).toEqual([
      first.id,
    ]);
  });

  it("rejects an invalid before cursor", async () => {
    const { conversation } = await seedConversation();

    await expect(
      getMessages(conversation.id, { before: "not-a-cursor" }),
    ).rejects.toBeInstanceOf(InvalidCursorError);
  });

  it("excludes soft-deleted messages", async () => {
    const { user, conversation } = await seedConversation();

    const kept = await createMessage(
      conversation.id,
      user.id,
      "Visible",
    );
    const deleted = await createMessage(
      conversation.id,
      user.id,
      "Hidden",
    );

    await db
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(eq(messages.id, deleted.id));

    const result = await getMessages(conversation.id);

    expect(result.messages.map((message) => message.id)).toEqual([
      kept.id,
    ]);
  });
});
