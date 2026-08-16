import { describe, expect, it } from "vitest";

import { createCall } from "./calls.js";
import { addConversationMember, createConversation } from "./conversations.js";
import {
  insertRecordingFragment,
  listFragmentsForCall,
  sumFragmentStats,
} from "./recording-fragments.js";
import { insertStartingRecording } from "./recordings.js";
import { createUser } from "./users.js";

describe("recording fragments repository", () => {
  it("stores two users as independent fragment streams", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = await createConversation("General", alice.id);
    await addConversationMember(conversation.id, bob.id);
    const call = await createCall(conversation.id, alice.id, "audio");

    const aliceSession = await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000501",
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      callOffsetMs: 0,
      objectKey: "alice",
      providerTrackSid: "TR_a",
    });
    const bobSession = await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000502",
      callId: call.id,
      conversationId: conversation.id,
      userId: bob.id,
      callOffsetMs: 0,
      objectKey: "bob",
      providerTrackSid: "TR_b",
    });

    await insertRecordingFragment({
      recordingId: aliceSession.id,
      callId: call.id,
      userId: alice.id,
      callOffsetMs: 0,
      durationMs: 500,
      objectKey: "alice/0.wav",
      sizeBytes: 10,
    });
    await insertRecordingFragment({
      recordingId: bobSession.id,
      callId: call.id,
      userId: bob.id,
      callOffsetMs: 0,
      durationMs: 500,
      objectKey: "bob/0.wav",
      sizeBytes: 11,
    });

    const rows = await listFragmentsForCall(call.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.userId).sort()).toEqual(
      [alice.id, bob.id].sort(),
    );
    expect(await sumFragmentStats(aliceSession.id)).toEqual({
      durationMs: 500,
      sizeBytes: 10,
    });
  });
});
