import { eq, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "../database.js";
import { outboxEvents } from "../db/schema.js";
import { createUser } from "../repositories/users.js";
import { createConversation } from "../repositories/conversations.js";
import { createMessage } from "../repositories/messages.js";
import { eventBus } from "./event-bus-instance.js";
import { publishPendingEvents } from "./outbox-publisher.js";

describe("outbox publisher", () => {
  it("claims pending outbox rows, publishes them, and marks them published", async () => {
    const user = await createUser("Alice");
    const conversation = await createConversation("General", user.id);
    const message = await createMessage(
      conversation.id,
      user.id,
      "Hello",
    );

    const publishSpy = vi.spyOn(eventBus, "publish");

    await publishPendingEvents();

    expect(publishSpy).toHaveBeenCalledOnce();
    expect(publishSpy.mock.calls[0][0]).toMatchObject({
      type: "message.created",
      conversationId: conversation.id,
      actorId: user.id,
      payload: {
        messageId: message.id,
        content: "Hello",
      },
    });

    const [publishedRow] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, message.id));

    expect(publishedRow.publishedAt).not.toBeNull();
    expect(publishedRow.claimedAt).not.toBeNull();
  });

  it("does not republish already published events", async () => {
    const user = await createUser("Alice");
    const conversation = await createConversation("General", user.id);
    await createMessage(conversation.id, user.id, "Hello");

    const publishSpy = vi.spyOn(eventBus, "publish");

    await publishPendingEvents();
    await publishPendingEvents();

    expect(publishSpy).toHaveBeenCalledOnce();
  });

  it("skips malformed outbox payloads without marking them published", async () => {
    const user = await createUser("Alice");
    const conversation = await createConversation("General", user.id);
    const message = await createMessage(
      conversation.id,
      user.id,
      "Hello",
    );

    await db
      .update(outboxEvents)
      .set({ payload: { invalid: true } })
      .where(eq(outboxEvents.aggregateId, message.id));

    const publishSpy = vi.spyOn(eventBus, "publish");

    await publishPendingEvents();

    expect(publishSpy).not.toHaveBeenCalled();

    const [row] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, message.id));

    expect(row.publishedAt).toBeNull();
  });

  it("reclaims stale leases for unpublished events", async () => {
    const user = await createUser("Alice");
    const conversation = await createConversation("General", user.id);
    const message = await createMessage(
      conversation.id,
      user.id,
      "Hello",
    );

    const staleClaim = new Date(Date.now() - 120_000);

    await db
      .update(outboxEvents)
      .set({ claimedAt: staleClaim })
      .where(eq(outboxEvents.aggregateId, message.id));

    const publishSpy = vi.spyOn(eventBus, "publish");

    await publishPendingEvents();

    expect(publishSpy).toHaveBeenCalledOnce();

    const [row] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, message.id));

    expect(row.publishedAt).not.toBeNull();
    expect(row.claimedAt!.getTime()).toBeGreaterThan(staleClaim.getTime());
  });

  it("leaves freshly claimed unpublished events alone until the lease expires", async () => {
    const user = await createUser("Alice");
    const conversation = await createConversation("General", user.id);
    const message = await createMessage(
      conversation.id,
      user.id,
      "Hello",
    );

    await db
      .update(outboxEvents)
      .set({ claimedAt: new Date() })
      .where(eq(outboxEvents.aggregateId, message.id));

    const publishSpy = vi.spyOn(eventBus, "publish");

    await publishPendingEvents();

    expect(publishSpy).not.toHaveBeenCalled();

    const unpublished = await db
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.publishedAt));

    expect(unpublished).toHaveLength(1);
  });
});
