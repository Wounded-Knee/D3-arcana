import { describe, expect, it } from "vitest";

import { createUser } from "./users.js";
import { addConversationMember, createConversation } from "./conversations.js";
import {
  createCall,
  upsertParticipantJoined,
} from "./calls.js";
import {
  getCallTimelineTracks,
  upsertWaveformSamples,
} from "./waveform.js";

describe("waveform repository", () => {
  async function seedCall() {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = await createConversation("General", alice.id);
    await addConversationMember(conversation.id, bob.id);
    const call = await createCall(conversation.id, alice.id, "audio");
    await upsertParticipantJoined(
      call.id,
      conversation.id,
      alice.id,
      "publisher",
    );

    return { alice, bob, conversation, call };
  }

  it("upserts samples into 1s chunks and returns timeline tracks", async () => {
    const { alice, call } = await seedCall();

    await upsertWaveformSamples(call.id, alice.id, 0, [10, 20, 30]);
    await upsertWaveformSamples(call.id, alice.id, 0, [11, 21, 31]);
    await upsertWaveformSamples(
      call.id,
      alice.id,
      800,
      [1, 2, 3, 4, 5],
    );

    const tracks = await getCallTimelineTracks(call.id);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].userId).toBe(alice.id);
    expect(tracks[0].displayName).toBe("Alice");
    expect(tracks[0].sessions).toHaveLength(1);
    expect(tracks[0].chunks).toHaveLength(2);

    expect(tracks[0].chunks[0].startOffsetMs).toBe(0);
    expect(tracks[0].chunks[0].amplitudes[0]).toBe(11);
    expect(tracks[0].chunks[0].amplitudes[16]).toBe(1);
    expect(tracks[0].chunks[1].startOffsetMs).toBe(1000);
    expect(tracks[0].chunks[1].amplitudes).toEqual([5]);
  });
});
