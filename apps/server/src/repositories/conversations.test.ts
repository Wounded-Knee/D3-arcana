import { describe, expect, it } from "vitest";

import { createUser } from "./users.js";
import {
  createConversation,
  getConversationById,
  getConversationMembers,
  getConversationsForUser,
  isConversationMember,
} from "./conversations.js";

describe("conversations repository", () => {
  it("creates a conversation and adds the creator as a member", async () => {
    const creator = await createUser("Alice");
    const conversation = await createConversation(
      "General",
      creator.id,
    );

    expect(conversation.name).toBe("General");
    expect(conversation.createdBy).toBe(creator.id);

    const fetched = await getConversationById(conversation.id);
    expect(fetched).toEqual(conversation);

    const members = await getConversationMembers(conversation.id);
    expect(members).toEqual([
      { id: creator.id, displayName: "Alice" },
    ]);
  });

  it("lists conversations for a user via membership", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");

    const first = await createConversation("First", alice.id);
    const second = await createConversation("Second", alice.id);
    await createConversation("Bob only", bob.id);

    const conversations = await getConversationsForUser(alice.id);

    expect(conversations.map((conversation) => conversation.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("checks conversation membership", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = await createConversation("Team", alice.id);

    expect(
      await isConversationMember(conversation.id, alice.id),
    ).toBe(true);
    expect(
      await isConversationMember(conversation.id, bob.id),
    ).toBe(false);
  });
});
