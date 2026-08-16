import request from "supertest";
import { describe, expect, it } from "vitest";

import type { MockMediaSessionProvider } from "../media/mock-media-provider.js";
import { createConversation, addConversationMember } from "../repositories/conversations.js";
import { createCall } from "../repositories/calls.js";
import { listRecordingsForCall } from "../repositories/recordings.js";
import { createUser } from "../repositories/users.js";
import { createAuthenticatedTestApp } from "../test/helpers/app.js";

async function mediaProvider(): Promise<MockMediaSessionProvider> {
  const { getMediaSessionProvider } = await import(
    "../media/media-provider-instance.js"
  );
  return getMediaSessionProvider() as MockMediaSessionProvider;
}

describe("livekit recording webhooks", () => {
  it("starts a per-track recording on track_published", async () => {
    const alice = await createUser("Alice");
    const conversation = await createConversation("Calls", alice.id);
    await addConversationMember(conversation.id, alice.id);
    const call = await createCall(conversation.id, alice.id, "audio");

    const app = await createAuthenticatedTestApp({
      "test-alice": alice.id,
    });
    const media = await mediaProvider();
    media.webhookEvent = {
      event: "track_published",
      room: { name: `call-${call.id}` },
      participant: { identity: alice.id },
      track: { sid: "TR_mic", type: "AUDIO", source: "MICROPHONE" },
    };

    await request(app)
      .post("/webhooks/livekit")
      .set("Content-Type", "application/webhook+json")
      .send(Buffer.from("{}"))
      .expect(200);

    const recordings = await listRecordingsForCall(call.id);
    expect(recordings).toHaveLength(1);
    expect(recordings[0]?.userId).toBe(alice.id);
    expect(recordings[0]?.status).toBe("recording");
    expect(media.startTrackRecordingCalls).toHaveLength(1);
  });

  it("completes a recording on successful egress_ended", async () => {
    const alice = await createUser("Alice");
    const conversation = await createConversation("Calls", alice.id);
    await addConversationMember(conversation.id, alice.id);
    const call = await createCall(conversation.id, alice.id, "audio");

    const app = await createAuthenticatedTestApp({
      "test-alice": alice.id,
    });
    const media = await mediaProvider();
    media.webhookEvent = {
      event: "track_published",
      room: { name: `call-${call.id}` },
      participant: { identity: alice.id },
      track: { sid: "TR_mic", type: "AUDIO", source: "MICROPHONE" },
    };

    await request(app)
      .post("/webhooks/livekit")
      .set("Content-Type", "application/webhook+json")
      .send(Buffer.from("{}"))
      .expect(200);

    const [started] = await listRecordingsForCall(call.id);
    const { insertRecordingFragment } = await import(
      "../repositories/recording-fragments.js"
    );
    await insertRecordingFragment({
      recordingId: started!.id,
      callId: call.id,
      userId: alice.id,
      callOffsetMs: 0,
      durationMs: 2000,
      objectKey: `${started!.objectKey}/0.wav`,
      sizeBytes: 1234,
    });
    media.webhookEvent = {
      event: "egress_ended",
      egressInfo: {
        egressId: started?.providerEgressId,
        roomName: `call-${call.id}`,
        status: "EGRESS_COMPLETE",
        fileResults: [{ duration: 2_000_000_000, size: 1234 }],
      },
    };

    await request(app)
      .post("/webhooks/livekit")
      .set("Content-Type", "application/webhook+json")
      .send(Buffer.from("{}"))
      .expect(200);

    const [completed] = await listRecordingsForCall(call.id);
    expect(completed?.status).toBe("ready");
    expect(completed?.durationMs).toBe(2000);
    expect(completed?.sizeBytes).toBe(1234);
  });

  it("ignores egress worker join and leave identities", async () => {
    const alice = await createUser("Alice");
    const conversation = await createConversation("Calls", alice.id);
    await addConversationMember(conversation.id, alice.id);
    const call = await createCall(conversation.id, alice.id, "audio");

    const app = await createAuthenticatedTestApp({
      "test-alice": alice.id,
    });
    const media = await mediaProvider();
    media.webhookEvent = {
      event: "participant_left",
      room: { name: `call-${call.id}` },
      participant: { identity: "EG_Jt6tQFszTwUB" },
    };

    await request(app)
      .post("/webhooks/livekit")
      .set("Content-Type", "application/webhook+json")
      .send(Buffer.from("{}"))
      .expect(200);
  });
});
