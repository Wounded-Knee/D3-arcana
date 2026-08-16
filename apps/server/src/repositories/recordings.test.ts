import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "../database.js";
import { outboxEvents } from "../db/schema.js";
import { createConversation, addConversationMember } from "./conversations.js";
import { createCall } from "./calls.js";
import {
  insertStartingRecording,
  listRecordingsForCall,
  markRecordingActive,
  markRecordingCompleted,
  markRecordingFailed,
} from "./recordings.js";
import { createUser } from "./users.js";

describe("recordings repository", () => {
  async function seedCall() {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = await createConversation("General", alice.id);
    await addConversationMember(conversation.id, bob.id);
    const call = await createCall(conversation.id, alice.id, "audio");
    return { alice, bob, conversation, call };
  }

  it("stores two participant tracks independently", async () => {
    const { alice, bob, call, conversation } = await seedCall();

    await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000101",
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      callOffsetMs: 0,
      objectKey: "alice.ogg",
      providerTrackSid: "TR_alice",
    });
    await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000102",
      callId: call.id,
      conversationId: conversation.id,
      userId: bob.id,
      callOffsetMs: 250,
      objectKey: "bob.ogg",
      providerTrackSid: "TR_bob",
    });

    const rows = await listRecordingsForCall(call.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.userId).sort()).toEqual(
      [alice.id, bob.id].sort(),
    );
    expect(rows[0]?.callOffsetMs).toBe(0);
    expect(rows[1]?.callOffsetMs).toBe(250);
  });

  it("records a second segment for the same user after leave/rejoin", async () => {
    const { alice, conversation, call } = await seedCall();

    const first = await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000201",
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      callOffsetMs: 0,
      objectKey: "a1.ogg",
      providerTrackSid: "TR_a1",
    });
    await markRecordingActive(
      first.id,
      "EG_1",
      alice.id,
      {
        type: "call.recording.started",
        payload: {
          callId: call.id,
          userId: alice.id,
          recordingId: first.id,
          objectKey: "a1.ogg",
          callOffsetMs: 0,
        },
      },
    );
    await markRecordingCompleted(first.id, {
      durationMs: 1000,
      sizeBytes: 10,
      actorId: alice.id,
    });

    const second = await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000202",
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      callOffsetMs: 4000,
      objectKey: "a2.ogg",
      providerTrackSid: "TR_a2",
    });
    await markRecordingActive(
      second.id,
      "EG_2",
      alice.id,
      {
        type: "call.recording.started",
        payload: {
          callId: call.id,
          userId: alice.id,
          recordingId: second.id,
          objectKey: "a2.ogg",
          callOffsetMs: 4000,
        },
      },
    );

    const rows = await listRecordingsForCall(call.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.userId === alice.id)).toBe(true);
    expect(rows[1]?.callOffsetMs).toBe(4000);
  });

  it("emits failed and restored outbox events", async () => {
    const { alice, conversation, call } = await seedCall();

    const failed = await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000301",
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      callOffsetMs: 0,
      objectKey: "fail.ogg",
      providerTrackSid: "TR_fail",
    });
    await markRecordingFailed(failed.id, "egress down", alice.id);

    const restored = await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000302",
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      callOffsetMs: 800,
      objectKey: "restored.ogg",
      providerTrackSid: "TR_fail",
    });
    await markRecordingActive(
      restored.id,
      "EG_restore",
      alice.id,
      {
        type: "call.recording.restored",
        payload: {
          callId: call.id,
          userId: alice.id,
          recordingId: restored.id,
          objectKey: "restored.ogg",
          callOffsetMs: 800,
          previousRecordingId: failed.id,
        },
      },
    );

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.conversationId, conversation.id));

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "call.recording.failed",
        "call.recording.restored",
      ]),
    );
  });
});
