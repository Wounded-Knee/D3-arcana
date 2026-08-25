import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { SEEDED_ANNOTATION_PROFILES } from "../repositories/annotations.js";
import { addConversationMember, createConversation } from "../repositories/conversations.js";
import { createUser } from "../repositories/users.js";
import {
  createAuthenticatedTestApp,
  createTestApp,
} from "../test/helpers/app.js";

describe("annotation routes", () => {
  afterEach(async () => {
    const { createTestApp: reloadApp } = await import(
      "../test/helpers/app.js"
    );
    await reloadApp();
  });

  async function seedMembers() {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const outsider = await createUser("Outsider");
    const conversation = await createConversation("Calls", alice.id);
    await addConversationMember(conversation.id, bob.id);

    const app = await createAuthenticatedTestApp({
      "test-alice": alice.id,
      "test-bob": bob.id,
      "test-outsider": outsider.id,
    });

    const join = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/calls/join`)
      .set("Authorization", "Bearer test-alice")
      .send({})
      .expect(201);

    return {
      alice,
      bob,
      outsider,
      conversation,
      app,
      callId: join.body.callId as string,
    };
  }

  it("requires auth to list profiles", async () => {
    const app = await createTestApp();
    const response = await request(app)
      .get("/api/v1/annotation-profiles")
      .expect(401);
    expect(response.body.code).toBe("unauthorized");
  });

  it("lists seeded profiles", async () => {
    const { app } = await seedMembers();
    const response = await request(app)
      .get("/api/v1/annotation-profiles")
      .set("Authorization", "Bearer test-alice")
      .expect(200);
    expect(response.body.profiles.map((profile: { key: string }) => profile.key))
      .toEqual(SEEDED_ANNOTATION_PROFILES.map((profile) => profile.key));
  });

  it("rejects a non-member", async () => {
    const { conversation, app, callId } = await seedMembers();
    const response = await request(app)
      .get(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/annotations`,
      )
      .set("Authorization", "Bearer test-outsider")
      .expect(403);
    expect(response.body.code).toBe("forbidden");
  });

  it("creates a point annotation without a note", async () => {
    const { conversation, app, callId } = await seedMembers();
    const response = await request(app)
      .post(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/annotations`,
      )
      .set("Authorization", "Bearer test-alice")
      .send({
        profileId: SEEDED_ANNOTATION_PROFILES[0].id,
        startOffsetMs: 800,
        endOffsetMs: 800,
      })
      .expect(201);

    expect(response.body.note).toBeNull();
    expect(response.body.startOffsetMs).toBe(800);
    expect(response.body.endOffsetMs).toBe(800);
    expect(response.body.selectionId).toBeNull();
  });

  it("rounds fractional timeline offsets", async () => {
    const { conversation, app, callId } = await seedMembers();

    const selection = await request(app)
      .post(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/selections`,
      )
      .set("Authorization", "Bearer test-alice")
      .send({
        startOffsetMs: 1000.4,
        endOffsetMs: 2400.6,
      })
      .expect(201);

    expect(selection.body.startOffsetMs).toBe(1000);
    expect(selection.body.endOffsetMs).toBe(2401);

    const annotation = await request(app)
      .post(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/annotations`,
      )
      .set("Authorization", "Bearer test-alice")
      .send({
        profileId: SEEDED_ANNOTATION_PROFILES[0].id,
        selectionId: selection.body.id,
        startOffsetMs: 1000.4,
        endOffsetMs: 2400.6,
      })
      .expect(201);

    expect(annotation.body.startOffsetMs).toBe(1000);
    expect(annotation.body.endOffsetMs).toBe(2401);
  });

  it("creates a channel-scoped selection and links it later", async () => {
    const { alice, conversation, app, callId } = await seedMembers();

    const selectionResponse = await request(app)
      .post(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/selections`,
      )
      .set("Authorization", "Bearer test-alice")
      .send({
        startOffsetMs: 1000,
        endOffsetMs: 2400,
        userId: alice.id,
      })
      .expect(201);

    expect(selectionResponse.body.userId).toBe(alice.id);

    const annotationResponse = await request(app)
      .post(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/annotations`,
      )
      .set("Authorization", "Bearer test-alice")
      .send({
        profileId: SEEDED_ANNOTATION_PROFILES[5].id,
        startOffsetMs: 10,
        endOffsetMs: 10,
      })
      .expect(201);

    expect(annotationResponse.body.note).toBeNull();

    const linked = await request(app)
      .patch(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/annotations/${annotationResponse.body.id}`,
      )
      .set("Authorization", "Bearer test-alice")
      .send({ selectionId: selectionResponse.body.id })
      .expect(200);

    expect(linked.body.selectionId).toBe(selectionResponse.body.id);
    expect(linked.body.startOffsetMs).toBe(1000);
    expect(linked.body.endOffsetMs).toBe(2400);
    expect(linked.body.userId).toBe(alice.id);

    const noted = await request(app)
      .patch(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/annotations/${annotationResponse.body.id}`,
      )
      .set("Authorization", "Bearer test-alice")
      .send({ note: "Highlight this exchange" })
      .expect(200);

    expect(noted.body.note).toBe("Highlight this exchange");

    const listed = await request(app)
      .get(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/annotations`,
      )
      .set("Authorization", "Bearer test-bob")
      .expect(200);

    expect(listed.body.annotations[0].note).toBe("Highlight this exchange");
  });

  it("forbids a member from editing someone else's annotation", async () => {
    const { conversation, app, callId } = await seedMembers();
    const created = await request(app)
      .post(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/annotations`,
      )
      .set("Authorization", "Bearer test-alice")
      .send({
        profileId: SEEDED_ANNOTATION_PROFILES[2].id,
        startOffsetMs: 0,
        endOffsetMs: 0,
      })
      .expect(201);

    const response = await request(app)
      .patch(
        `/api/v1/conversations/${conversation.id}/calls/${callId}/annotations/${created.body.id}`,
      )
      .set("Authorization", "Bearer test-bob")
      .send({ note: "stolen" })
      .expect(403);

    expect(response.body.code).toBe("forbidden");
  });
});
