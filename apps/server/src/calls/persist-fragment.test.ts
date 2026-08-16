import { describe, expect, it } from "vitest";

import { createCall } from "../repositories/calls.js";
import { addConversationMember, createConversation } from "../repositories/conversations.js";
import { listFragmentsForCall } from "../repositories/recording-fragments.js";
import { insertStartingRecording } from "../repositories/recordings.js";
import { createUser } from "../repositories/users.js";
import { createTestObjectStore } from "../storage/object-store-instance.js";
import { fragmentByteLength } from "../storage/wav.js";
import { persistPcmFragment } from "./persist-fragment.js";

describe("persistPcmFragment", () => {
  it("writes a 500ms WAV and indexes it while the session is still recording", async () => {
    createTestObjectStore();
    const alice = await createUser("Alice");
    const conversation = await createConversation("General", alice.id);
    await addConversationMember(conversation.id, alice.id);
    const call = await createCall(conversation.id, alice.id, "audio");
    const recording = await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000701",
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      callOffsetMs: 0,
      objectKey: "alice-session",
      providerTrackSid: "TR_mic",
    });

    const persisted = await persistPcmFragment({
      recording,
      pcm: Buffer.alloc(fragmentByteLength(500)),
      callOffsetMs: 0,
    });

    expect(persisted.durationMs).toBe(500);
    expect(persisted.objectKey).toBe("alice-session/0.wav");
    const fragments = await listFragmentsForCall(call.id);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.durationMs).toBe(500);
  });
});
