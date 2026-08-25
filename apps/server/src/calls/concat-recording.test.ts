import { describe, expect, it } from "vitest";

import { createCall } from "../repositories/calls.js";
import { addConversationMember, createConversation } from "../repositories/conversations.js";
import { insertStartingRecording } from "../repositories/recordings.js";
import { createUser } from "../repositories/users.js";
import { createTestObjectStore } from "../storage/object-store-instance.js";
import { fragmentByteLength, wavDurationMs } from "../storage/wav.js";
import { persistPcmFragment } from "./persist-fragment.js";
import { buildRecordingMedia, mediaObjectKey } from "./concat-recording.js";

describe("buildRecordingMedia", () => {
  it("stitches sequential fragments into one session WAV", async () => {
    const store = createTestObjectStore();
    const alice = await createUser("Alice");
    const conversation = await createConversation("General", alice.id);
    await addConversationMember(conversation.id, alice.id);
    const call = await createCall(conversation.id, alice.id, "audio");
    const recording = await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000801",
      callId: call.id,
      conversationId: conversation.id,
      userId: alice.id,
      callOffsetMs: 0,
      objectKey: "alice-session",
      providerTrackSid: "TR_mic",
    });

    const pcm = Buffer.alloc(fragmentByteLength(500), 7);
    await persistPcmFragment({
      recording,
      pcm,
      callOffsetMs: 0,
    });
    await persistPcmFragment({
      recording,
      pcm,
      callOffsetMs: 500,
    });

    const media = await buildRecordingMedia(recording.id, call.id);
    expect(media).not.toBeNull();
    expect(media?.callOffsetMs).toBe(0);
    expect(media?.durationMs).toBe(1000);
    expect(media?.playbackUrl).toContain("alice-session");

    const cached = await store.get(mediaObjectKey("alice-session", 2, 500));
    expect(cached).not.toBeNull();
    expect(cached!.readUInt16LE(22)).toBe(1);
    expect(wavDurationMs(cached!)).toBe(1000);

    const again = await buildRecordingMedia(recording.id, call.id);
    expect(again?.playbackUrl).toBeTruthy();
    expect(
      store.puts.filter((item) => item.key.includes("/media/")),
    ).toHaveLength(1);
  });
});
