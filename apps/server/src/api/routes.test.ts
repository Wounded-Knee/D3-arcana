import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createUser } from "../repositories/users.js";
import { createConversation } from "../repositories/conversations.js";
import { createMessage } from "../repositories/messages.js";
import {
  createAuthenticatedTestApp,
  createTestApp,
} from "../test/helpers/app.js";

describe("HTTP API routes", () => {
  afterEach(async () => {
    const { createTestApp: reloadApp } = await import(
      "../test/helpers/app.js"
    );
    await reloadApp();
  });

  it("creates and fetches users", async () => {
    const app = await createTestApp();

    const createResponse = await request(app)
      .post("/api/v1/users")
      .send({ displayName: "Alice" })
      .expect(201);

    expect(createResponse.body.displayName).toBe("Alice");

    const getResponse = await request(app)
      .get(`/api/v1/users/${createResponse.body.id}`)
      .expect(200);

    expect(getResponse.body).toEqual(createResponse.body);
  });

  it("returns 404 for an unknown user", async () => {
    const app = await createTestApp();

    const response = await request(app)
      .get("/api/v1/users/00000000-0000-4000-8000-000000000001")
      .expect(404);

    expect(response.body.code).toBe("not_found");
  });

  it("returns 400 for invalid UUID params", async () => {
    const app = await createTestApp();

    const response = await request(app)
      .get("/api/v1/users/not-a-uuid")
      .expect(400);

    expect(response.body.code).toBe("bad_request");
  });

  it("requires auth for protected routes", async () => {
    const app = await createTestApp();

    const response = await request(app)
      .post("/api/v1/conversations")
      .send({ name: "General" })
      .expect(401);

    expect(response.body.code).toBe("unauthorized");
  });

  it("creates conversations and messages for authenticated users", async () => {
    const alice = await createUser("Alice");
    const app = await createAuthenticatedTestApp({
      "test-alice": alice.id,
    });

    const conversationResponse = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", "Bearer test-alice")
      .send({ name: "General" })
      .expect(201);

    const messageResponse = await request(app)
      .post(
        `/api/v1/conversations/${conversationResponse.body.id}/messages`,
      )
      .set("Authorization", "Bearer test-alice")
      .send({ content: "Hello" })
      .expect(201);

    expect(messageResponse.body.content).toBe("Hello");
    expect(messageResponse.body.senderId).toBe(alice.id);
  });

  it("returns 403 when creating a message as a non-member", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = await createConversation("Private", alice.id);

    const app = await createAuthenticatedTestApp({
      "test-bob": bob.id,
    });

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", "Bearer test-bob")
      .send({ content: "Intruder" })
      .expect(403);

    expect(response.body.code).toBe("forbidden");
  });

  it("lists conversations only for the authenticated user", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const aliceConversation = await createConversation("Alice room", alice.id);
    await createConversation("Bob room", bob.id);

    const app = await createAuthenticatedTestApp({
      "test-alice": alice.id,
      "test-bob": bob.id,
    });

    const ownList = await request(app)
      .get(`/api/v1/users/${alice.id}/conversations`)
      .set("Authorization", "Bearer test-alice")
      .expect(200);

    expect(ownList.body.conversations).toHaveLength(1);
    expect(ownList.body.conversations[0].id).toBe(aliceConversation.id);

    const forbidden = await request(app)
      .get(`/api/v1/users/${bob.id}/conversations`)
      .set("Authorization", "Bearer test-alice")
      .expect(403);

    expect(forbidden.body.code).toBe("forbidden");
  });

  it("returns paginated conversation messages", async () => {
    const alice = await createUser("Alice");
    const conversation = await createConversation("General", alice.id);
    const first = await createMessage(
      conversation.id,
      alice.id,
      "First",
    );
    const second = await createMessage(
      conversation.id,
      alice.id,
      "Second",
    );

    const app = await createTestApp();

    const response = await request(app)
      .get(`/api/v1/conversations/${conversation.id}/messages`)
      .query({ limit: 1, before: second.id })
      .expect(200);

    expect(response.body.hasMore).toBe(false);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0].id).toBe(first.id);
  });
});
