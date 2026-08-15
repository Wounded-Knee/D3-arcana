import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "../database.js";
import { calls, callParticipants, outboxEvents } from "../db/schema.js";
import { createUser } from "./users.js";
import { createConversation, addConversationMember } from "./conversations.js";
import {
  countActiveParticipants,
  createCall,
  endCall,
  getActiveCallForConversation,
  markParticipantLeft,
  upsertParticipantJoined,
} from "./calls.js";

describe("calls repository", () => {
  async function seedConversation() {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = await createConversation("General", alice.id);
    await addConversationMember(conversation.id, bob.id);

    return { alice, bob, conversation };
  }

  it("creates a call and emits call.started outbox event", async () => {
    const { alice, conversation } = await seedConversation();

    const call = await createCall(conversation.id, alice.id, "audio");

    expect(call.status).toBe("active");

    const outboxRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, call.id));

    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].type).toBe("call.started");
    expect(outboxRows[0].payload).toEqual({
      callId: call.id,
      mediaMode: "audio",
    });
  });

  it("enforces one active call per conversation", async () => {
    const { alice, conversation } = await seedConversation();

    await createCall(conversation.id, alice.id, "audio");

    await expect(
      createCall(conversation.id, alice.id, "audio"),
    ).rejects.toThrow();
  });

  it("tracks participants joining and leaving", async () => {
    const { alice, bob, conversation } = await seedConversation();
    const call = await createCall(conversation.id, alice.id, "audio");

    await upsertParticipantJoined(
      call.id,
      conversation.id,
      alice.id,
      "publisher",
    );
    await upsertParticipantJoined(
      call.id,
      conversation.id,
      bob.id,
      "publisher",
    );

    expect(await countActiveParticipants(call.id)).toBe(2);

    await markParticipantLeft(call.id, conversation.id, alice.id);
    expect(await countActiveParticipants(call.id)).toBe(1);

    const [aliceRow] = await db
      .select()
      .from(callParticipants)
      .where(eq(callParticipants.userId, alice.id));

    expect(aliceRow.leftAt).not.toBeNull();
  });

  it("ends a call and emits call.ended", async () => {
    const { alice, conversation } = await seedConversation();
    const call = await createCall(conversation.id, alice.id, "audio");

    const ended = await endCall(call.id, alice.id, "empty_room");
    expect(ended?.status).toBe("ended");

    const active = await getActiveCallForConversation(conversation.id);
    expect(active).toBeNull();

    const outboxRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.type, "call.ended"));

    expect(outboxRows.some((row) => row.aggregateId === call.id)).toBe(true);
  });
});
