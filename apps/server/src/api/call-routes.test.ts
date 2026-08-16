import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createUser } from "../repositories/users.js";
import {
  addConversationMember,
  createConversation,
} from "../repositories/conversations.js";
import {
  createAuthenticatedTestApp,
  createTestApp,
  createTestServer,
} from "../test/helpers/app.js";
import {
  connectWs,
  waitForMessage,
  type WsTestClient,
} from "../test/helpers/ws-client.js";

describe("call routes", () => {
  afterEach(async () => {
    const { createTestApp: reloadApp } = await import(
      "../test/helpers/app.js"
    );
    await reloadApp();
  });

  async function seedMembers() {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = await createConversation("Calls", alice.id);
    await addConversationMember(conversation.id, bob.id);

    const app = await createAuthenticatedTestApp({
      "test-alice": alice.id,
      "test-bob": bob.id,
    });

    return { alice, bob, conversation, app };
  }

  it("requires auth to join a call", async () => {
    const app = await createTestApp();
    const conversationId = "00000000-0000-4000-8000-000000000010";

    const response = await request(app)
      .post(`/api/v1/conversations/${conversationId}/calls/join`)
      .send({})
      .expect(401);

    expect(response.body.code).toBe("unauthorized");
  });

  it("requires membership to join a call", async () => {
    const alice = await createUser("Alice");
    const outsider = await createUser("Outsider");
    const conversation = await createConversation("Private", alice.id);

    const app = await createAuthenticatedTestApp({
      "test-outsider": outsider.id,
    });

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-outsider")
      .send({})
      .expect(403);

    expect(response.body.code).toBe("forbidden");
  });

  it("creates a call and returns LiveKit credentials", async () => {
    const { conversation, app } = await seedMembers();

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({ role: "publisher" })
      .expect(201);

    expect(response.body).toMatchObject({
      provider: "livekit",
      url: "ws://127.0.0.1:7880",
      role: "publisher",
    });
    expect(typeof response.body.callId).toBe("string");
    expect(typeof response.body.token).toBe("string");
    expect(typeof response.body.expiresAt).toBe("string");
  });

  it("returns active call details", async () => {
    const { conversation, app } = await seedMembers();

    const joinResponse = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(201);

    const activeResponse = await request(app)
      .get(`/api/v1/conversations/${conversation.id}/calls/active`)
      .set("Authorization", "Bearer test-bob")
      .expect(200);

    expect(activeResponse.body.call.id).toBe(joinResponse.body.callId);
    expect(activeResponse.body.participants.length).toBeGreaterThan(0);
  });

  it("allows leaving a call", async () => {
    const { conversation, app } = await seedMembers();

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(201);

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/leave`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(204);
  });

  it("requires an active participant to ingest waveform samples", async () => {
    const { conversation, app } = await seedMembers();

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/waveform`)
      .set("Authorization", "Bearer test-alice")
      .send({ startOffsetMs: 0, amplitudes: [1, 2, 3] })
      .expect(404);

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(201);

    const forbidden = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/waveform`)
      .set("Authorization", "Bearer test-bob")
      .send({ startOffsetMs: 0, amplitudes: [1, 2, 3] })
      .expect(403);

    expect(forbidden.body.code).toBe("forbidden");
  });

  it("stores waveform samples and returns them to a late joiner", async () => {
    const { conversation, app } = await seedMembers();

    const joinResponse = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(201);

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/waveform`)
      .set("Authorization", "Bearer test-alice")
      .send({ startOffsetMs: 0, amplitudes: [10, 20, 30] })
      .expect(204);

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/leave`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(204);

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(200);

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-bob")
      .send({})
      .expect(200);

    const timeline = await request(app)
      .get(`/api/v1/conversations/${conversation.id}/calls/active/timeline`)
      .set("Authorization", "Bearer test-bob")
      .expect(200);

    expect(timeline.body.call.id).toBe(joinResponse.body.callId);
    expect(typeof timeline.body.call.startedAt).toBe("string");

    const aliceTrack = timeline.body.tracks.find(
      (track: { userId: string; displayName: string }) =>
        track.displayName === "Alice",
    );
    expect(aliceTrack.sessions).toHaveLength(2);
    expect(aliceTrack.sessions[0].leftAt).not.toBeNull();
    expect(aliceTrack.sessions[1].leftAt).toBeNull();
    expect(aliceTrack.chunks[0].amplitudes.slice(0, 3)).toEqual([10, 20, 30]);

    const bobTrack = timeline.body.tracks.find(
      (track: { userId: string; displayName: string }) =>
        track.displayName === "Bob",
    );
    expect(bobTrack.sessions).toHaveLength(1);
    expect(bobTrack.chunks).toEqual([]);
  });

  it("rejects invalid waveform payloads", async () => {
    const { conversation, app } = await seedMembers();

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(201);

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/waveform`)
      .set("Authorization", "Bearer test-alice")
      .send({ startOffsetMs: 0, amplitudes: [] })
      .expect(400);

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/waveform`)
      .set("Authorization", "Bearer test-alice")
      .send({ startOffsetMs: -1, amplitudes: [1] })
      .expect(400);
  });
});

describe("call recordings http", () => {
  async function seedMembers() {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = await createConversation("Calls", alice.id);
    await addConversationMember(conversation.id, bob.id);

    const app = await createAuthenticatedTestApp({
      "test-alice": alice.id,
      "test-bob": bob.id,
    });

    return { alice, bob, conversation, app };
  }

  it("lists calls and returns ended-call timeline by call id", async () => {
    const { alice, conversation, app } = await seedMembers();

    const joinResponse = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(201);

    const callId = joinResponse.body.callId as string;

    await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/leave`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(204);

    const { endCall } = await import("../repositories/calls.js");
    await endCall(callId, alice.id, "empty_room");

    const list = await request(app)
      .get(`/api/v1/conversations/${conversation.id}/calls`)
      .set("Authorization", "Bearer test-alice")
      .expect(200);

    expect(list.body.calls).toHaveLength(1);
    expect(list.body.calls[0].id).toBe(callId);
    expect(list.body.calls[0].status).toBe("ended");

    const timeline = await request(app)
      .get(`/api/v1/conversations/${conversation.id}/calls/${callId}/timeline`)
      .set("Authorization", "Bearer test-alice")
      .expect(200);

    expect(timeline.body.call.id).toBe(callId);
    expect(timeline.body.call.endedAt).toEqual(expect.any(String));
  });

  it("returns playback URLs for ready recordings", async () => {
    const { alice, conversation, app } = await seedMembers();
    const joinResponse = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(201);
    const callId = joinResponse.body.callId as string;

    const {
      insertStartingRecording,
      markRecordingActive,
    } = await import("../repositories/recordings.js");
    const { insertRecordingFragment } = await import(
      "../repositories/recording-fragments.js"
    );

    const recording = await insertStartingRecording({
      id: "00000000-0000-4000-8000-000000000401",
      callId,
      conversationId: conversation.id,
      userId: alice.id,
      callOffsetMs: 0,
      objectKey: "alice-session",
      providerTrackSid: "TR_alice",
    });
    await markRecordingActive(recording.id, "EG_ready", alice.id, {
      type: "call.recording.started",
      payload: {
        callId,
        userId: alice.id,
        recordingId: recording.id,
        objectKey: "alice-session",
        callOffsetMs: 0,
      },
    });
    await insertRecordingFragment({
      recordingId: recording.id,
      callId,
      userId: alice.id,
      callOffsetMs: 0,
      durationMs: 500,
      objectKey: "alice-session/0.wav",
      sizeBytes: 48_044,
    });

    const response = await request(app)
      .get(`/api/v1/conversations/${conversation.id}/calls/${callId}/recordings`)
      .set("Authorization", "Bearer test-alice")
      .expect(200);

    expect(response.body.sessions[0].status).toBe("recording");
    expect(response.body.recordings).toHaveLength(1);
    expect(response.body.recordings[0].status).toBe("ready");
    expect(response.body.recordings[0].playbackUrl).toContain("alice-session%2F0.wav");
    expect(response.body.recordings[0].callOffsetMs).toBe(0);
    expect(response.body.recordings[0].durationMs).toBe(500);
  });
});

describe("call waveform websocket", () => {
  let testServer: Awaited<ReturnType<typeof createTestServer>> | undefined;
  let client: WsTestClient | undefined;

  afterEach(async () => {
    client?.close();
    client = undefined;

    if (testServer) {
      await testServer.close();
      testServer = undefined;
    }
  });

  it("broadcasts waveform chunks immediately after ingest", async () => {
    const alice = await createUser("Alice");
    const conversation = await createConversation("Calls", alice.id);

    testServer = await createTestServer({
      "test-alice": alice.id,
    });

    await request(testServer.app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(201);

    client = await connectWs(testServer.port);

    await waitForMessage(
      client.messages,
      (message) => message.type === "connection.ready",
    );

    client.send({
      type: "auth.authenticate",
      token: "test-alice",
    });

    await waitForMessage(
      client.messages,
      (message) => message.type === "auth.authenticated",
    );

    client.send({
      type: "conversation.join",
      conversationId: conversation.id,
    });

    await waitForMessage(
      client.messages,
      (message) => message.type === "conversation.joined",
    );

    await request(testServer.app)
      .post(`/api/v1/conversations/${conversation.id}/calls/waveform`)
      .set("Authorization", "Bearer test-alice")
      .send({ startOffsetMs: 0, amplitudes: [4, 5, 6] })
      .expect(204);

    const chunk = await waitForMessage(
      client.messages,
      (message) => message.type === "call.waveform.chunk",
    );

    expect(chunk).toMatchObject({
      type: "call.waveform.chunk",
      conversationId: conversation.id,
      userId: alice.id,
      startOffsetMs: 0,
      sampleRateHz: 20,
      amplitudes: [4, 5, 6],
    });
  });
});
