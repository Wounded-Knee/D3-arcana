import { describe, expect, it } from "vitest";

import { startTrackRecording } from "./recording-lifecycle.js";
import { MockMediaSessionProvider } from "../media/mock-media-provider.js";
import { setMediaSessionProviderForTests } from "../media/media-provider-instance.js";
import { createConversation, addConversationMember } from "../repositories/conversations.js";
import { createCall } from "../repositories/calls.js";
import {
  listRecordingsForCall,
} from "../repositories/recordings.js";
import { createUser } from "../repositories/users.js";
import { createTestObjectStore } from "../storage/object-store-instance.js";
import { eq } from "drizzle-orm";
import { db } from "../database.js";
import { outboxEvents } from "../db/schema.js";

describe("recording lifecycle", () => {
  async function seed() {
    const media = new MockMediaSessionProvider();
    setMediaSessionProviderForTests(media);
    createTestObjectStore();

    const alice = await createUser("Alice");
    const conversation = await createConversation("General", alice.id);
    await addConversationMember(conversation.id, alice.id);
    const call = await createCall(conversation.id, alice.id, "audio");
    return { alice, conversation, call, media };
  }

  it("starts one egress per audio track and is idempotent for the same track sid", async () => {
    const { alice, conversation, call, media } = await seed();

    const first = await startTrackRecording({
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      trackSid: "TR_1",
      callStartedAt: call.startedAt,
    });
    const second = await startTrackRecording({
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      trackSid: "TR_1",
      callStartedAt: call.startedAt,
    });

    expect(first?.id).toBe(second?.id);
    expect(media.startTrackRecordingCalls).toHaveLength(1);
    expect(media.startTrackRecordingCalls[0]?.websocketUrl).toContain(
      "/internal/egress",
    );
    expect(first?.status).toBe("recording");
  });

  it("marks failed and emits call.recording.failed when egress throws", async () => {
    const { alice, conversation, call, media } = await seed();
    media.startTrackRecordingError = new Error("egress down");

    const recording = await startTrackRecording({
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      trackSid: "TR_fail",
      callStartedAt: call.startedAt,
    });

    expect(recording?.status).toBe("failed");
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.type, "call.recording.failed"));
    expect(events).toHaveLength(1);
  });

  it("restores with a new row and call.recording.restored after a failure", async () => {
    const { alice, conversation, call, media } = await seed();
    media.startTrackRecordingError = new Error("egress down");

    await startTrackRecording({
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      trackSid: "TR_fail",
      callStartedAt: call.startedAt,
    });

    media.startTrackRecordingError = null;

    const restored = await startTrackRecording({
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      trackSid: "TR_fail",
      callStartedAt: call.startedAt,
    });

    const rows = await listRecordingsForCall(call.id);
    expect(rows).toHaveLength(2);
    expect(restored?.status).toBe("recording");
    expect(rows[1]?.callOffsetMs).toBeGreaterThanOrEqual(0);

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.type, "call.recording.restored"));
    expect(events).toHaveLength(1);
  });
});
