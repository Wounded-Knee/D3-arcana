import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createUser } from "../repositories/users.js";
import { createConversation } from "../repositories/conversations.js";
import { createTestServer } from "../test/helpers/app.js";
import {
  connectWs,
  waitForMessage,
  type WsTestClient,
} from "../test/helpers/ws-client.js";

describe("WebSocket server", () => {
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

  it("requires authentication before joining a conversation", async () => {
    testServer = await createTestServer();
    client = await connectWs(testServer.port);

    await waitForMessage(
      client.messages,
      (message) => message.type === "connection.ready",
    );

    client.send({
      type: "conversation.join",
      conversationId: "11111111-1111-4111-8111-111111111111",
    });

    const error = await waitForMessage(
      client.messages,
      (message) => message.type === "error",
    );

    expect(error).toMatchObject({
      type: "error",
      code: "not_authenticated",
    });
  });

  it("rejects invalid authentication tokens", async () => {
    testServer = await createTestServer();
    client = await connectWs(testServer.port);

    await waitForMessage(
      client.messages,
      (message) => message.type === "connection.ready",
    );

    client.send({
      type: "auth.authenticate",
      token: "invalid-token",
    });

    const error = await waitForMessage(
      client.messages,
      (message) => message.type === "error",
    );

    expect(error).toMatchObject({
      type: "error",
      code: "authentication_failed",
    });
  });

  it("rejects conversation joins for non-members", async () => {
    const alice = await createUser("Alice");
    await createConversation("Private", alice.id);

    testServer = await createTestServer({
      "test-alice": alice.id,
    });

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
      conversationId: "00000000-0000-4000-8000-000000000001",
    });

    const error = await waitForMessage(
      client.messages,
      (message) => message.type === "error",
    );

    expect(error).toMatchObject({
      type: "error",
      code: "not_a_member",
    });
  });

  it("delivers message.created events to subscribed clients", async () => {
    const alice = await createUser("Alice");
    const conversation = await createConversation("General", alice.id);

    testServer = await createTestServer({
      "test-alice": alice.id,
    });

    const { publishPendingEvents } = await import(
      "../events/outbox-publisher.js"
    );

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

    const createResponse = await request(testServer.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", "Bearer test-alice")
      .send({ content: "Hello over WS" })
      .expect(201);

    await publishPendingEvents();

    const eventMessage = await waitForMessage(
      client.messages,
      (message) => message.type === "event",
    );

    expect(eventMessage).toMatchObject({
      type: "event",
      event: {
        type: "message.created",
        conversationId: conversation.id,
        actorId: alice.id,
        payload: {
          messageId: createResponse.body.id,
          content: "Hello over WS",
        },
      },
    });
  });

  it("does not duplicate websocket broadcasts on repeated outbox delivery", async () => {
    const alice = await createUser("Alice");
    const conversation = await createConversation("General", alice.id);

    testServer = await createTestServer({
      "test-alice": alice.id,
    });

    const { publishPendingEvents } = await import(
      "../events/outbox-publisher.js"
    );

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
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", "Bearer test-alice")
      .send({ content: "Once only" })
      .expect(201);

    await publishPendingEvents();
    await publishPendingEvents();

    const eventMessages = client.messages.filter(
      (message) => message.type === "event",
    );

    expect(eventMessages).toHaveLength(1);
  });
});
