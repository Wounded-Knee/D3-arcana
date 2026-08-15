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
} from "../test/helpers/app.js";

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
});
