import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "../database.js";
import { outboxEvents } from "../db/schema.js";
import { createCall } from "./calls.js";
import { addConversationMember, createConversation } from "./conversations.js";
import { createUser } from "./users.js";
import {
  AnnotationForbiddenError,
  createCallAnnotation,
  createCallSelection,
  listAnnotationProfiles,
  SEEDED_ANNOTATION_PROFILES,
  updateCallAnnotation,
  updateCallSelection,
} from "./annotations.js";

describe("annotations repository", () => {
  async function seedCall() {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = await createConversation("Notes", alice.id);
    await addConversationMember(conversation.id, bob.id);
    const call = await createCall(conversation.id, alice.id, "audio");
    return { alice, bob, conversation, call };
  }

  it("lists seeded annotation profiles", async () => {
    const profiles = await listAnnotationProfiles();
    expect(profiles.map((profile) => profile.key)).toEqual(
      SEEDED_ANNOTATION_PROFILES.map((profile) => profile.key),
    );
  });

  it("creates a point annotation with a null note", async () => {
    const { alice, conversation, call } = await seedCall();
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[0].id,
      startOffsetMs: 1500,
      endOffsetMs: 1500,
    });

    expect(annotation.note).toBeNull();
    expect(annotation.startOffsetMs).toBe(1500);
    expect(annotation.endOffsetMs).toBe(1500);
    expect(annotation.selectionId).toBeNull();
    expect(annotation.profile.key).toBe("decision");

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, annotation.id));
    expect(events.some((event) => event.type === "annotation.created")).toBe(
      true,
    );
    expect(events[0]?.payload).toMatchObject({
      annotationId: annotation.id,
      note: null,
    });
  });

  it("creates an annotation linked to a selection", async () => {
    const { alice, conversation, call } = await seedCall();
    const selection = await createCallSelection({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      startOffsetMs: 1000,
      endOffsetMs: 2500,
      userId: alice.id,
    });

    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[1].id,
      selectionId: selection.id,
    });

    expect(annotation.note).toBeNull();
    expect(annotation.selectionId).toBe(selection.id);
    expect(annotation.startOffsetMs).toBe(1000);
    expect(annotation.endOffsetMs).toBe(2500);
    expect(annotation.userId).toBe(alice.id);
  });

  it("patches a note and emits annotation.updated", async () => {
    const { alice, conversation, call } = await seedCall();
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[2].id,
      startOffsetMs: 0,
      endOffsetMs: 0,
    });

    const updated = await updateCallAnnotation({
      annotationId: annotation.id,
      actorId: alice.id,
      note: "Ask about the bridge",
    });

    expect(updated.note).toBe("Ask about the bridge");
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, annotation.id));
    expect(events.some((event) => event.type === "annotation.updated")).toBe(
      true,
    );
  });

  it("syncs a linked annotation when the selection is resized", async () => {
    const { alice, conversation, call } = await seedCall();
    const selection = await createCallSelection({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      startOffsetMs: 2000,
      endOffsetMs: 4000,
    });
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[3].id,
      selectionId: selection.id,
    });

    await updateCallSelection({
      selectionId: selection.id,
      actorId: alice.id,
      startOffsetMs: 1800,
      endOffsetMs: 5000,
    });

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, annotation.id));
    expect(events.some((event) => event.type === "annotation.updated")).toBe(
      true,
    );
  });

  it("rejects updates from a non-author", async () => {
    const { alice, bob, conversation, call } = await seedCall();
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[4].id,
      startOffsetMs: 100,
      endOffsetMs: 100,
    });

    await expect(
      updateCallAnnotation({
        annotationId: annotation.id,
        actorId: bob.id,
        note: "nope",
      }),
    ).rejects.toBeInstanceOf(AnnotationForbiddenError);
  });
});
