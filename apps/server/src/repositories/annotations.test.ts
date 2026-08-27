import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { SIMPLE_MAJORITY_KEY } from "@d3-arcana/democracy";

import { db } from "../database.js";
import { callAnnotations, outboxEvents } from "../db/schema.js";
import { democracyRegistry } from "../democracy/registry-instance.js";
import { createCall } from "./calls.js";
import { addConversationMember, createConversation } from "./conversations.js";
import { createUser } from "./users.js";
import {
  AnnotationForbiddenError,
  AnnotationValidationError,
  createCallAnnotation,
  createCallSelection,
  getCallSelectionById,
  listAnnotationProfiles,
  SEEDED_ANNOTATION_PROFILES,
  serializeAnnotationForViewer,
  updateCallAnnotation,
  updateCallSelection,
  upsertAnnotationRatification,
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

  it("patches annotation range and scope", async () => {
    const { alice, bob, conversation, call } = await seedCall();
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[0].id,
      startOffsetMs: 1000,
      endOffsetMs: 2000,
      userId: alice.id,
    });

    const moved = await updateCallAnnotation({
      annotationId: annotation.id,
      actorId: alice.id,
      startOffsetMs: 1500,
      endOffsetMs: 2800,
      userId: bob.id,
    });
    expect(moved.startOffsetMs).toBe(1500);
    expect(moved.endOffsetMs).toBe(2800);
    expect(moved.userId).toBe(bob.id);

    const allTracks = await updateCallAnnotation({
      annotationId: annotation.id,
      actorId: alice.id,
      userId: null,
    });
    expect(allTracks.userId).toBeNull();
    expect(allTracks.startOffsetMs).toBe(1500);
    expect(allTracks.endOffsetMs).toBe(2800);
  });

  it("moves a point annotation without turning it into a range", async () => {
    const { alice, conversation, call } = await seedCall();
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[2].id,
      startOffsetMs: 400,
      endOffsetMs: 400,
    });

    const moved = await updateCallAnnotation({
      annotationId: annotation.id,
      actorId: alice.id,
      startOffsetMs: 900,
      endOffsetMs: 900,
    });
    expect(moved.startOffsetMs).toBe(900);
    expect(moved.endOffsetMs).toBe(900);
  });

  it("rejects a ranged annotation shorter than 50ms", async () => {
    const { alice, conversation, call } = await seedCall();
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[1].id,
      startOffsetMs: 1000,
      endOffsetMs: 2000,
    });

    await expect(
      updateCallAnnotation({
        annotationId: annotation.id,
        actorId: alice.id,
        startOffsetMs: 1000,
        endOffsetMs: 1020,
      }),
    ).rejects.toBeInstanceOf(AnnotationValidationError);
  });

  it("syncs a linked selection when the annotation is moved", async () => {
    const { alice, conversation, call } = await seedCall();
    const selection = await createCallSelection({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      startOffsetMs: 2000,
      endOffsetMs: 4000,
      userId: alice.id,
    });
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[3].id,
      selectionId: selection.id,
    });

    await updateCallAnnotation({
      annotationId: annotation.id,
      actorId: alice.id,
      startOffsetMs: 1200,
      endOffsetMs: 3600,
      userId: null,
    });

    const synced = await getCallSelectionById(selection.id);
    expect(synced?.startOffsetMs).toBe(1200);
    expect(synced?.endOffsetMs).toBe(3600);
    expect(synced?.userId).toBeNull();

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, selection.id));
    expect(events.some((event) => event.type === "selection.updated")).toBe(
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

  it("lets a non-author cast, switch, and retract a stance", async () => {
    const { alice, bob, conversation, call } = await seedCall();
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[0].id,
      startOffsetMs: 0,
      endOffsetMs: 0,
    });

    const cast = await upsertAnnotationRatification({
      annotationId: annotation.id,
      actorId: bob.id,
      stance: "for",
    });
    expect(cast.ratification.myStance).toBe("for");
    expect(cast.ratification.tallies).toEqual({
      for: 1,
      against: 0,
      totalUserCount: 2,
    });
    expect(cast.ratification.outcome).toEqual({ status: "open" });

    const switched = await upsertAnnotationRatification({
      annotationId: annotation.id,
      actorId: bob.id,
      stance: "against",
    });
    expect(switched.ratification.myStance).toBe("against");
    expect(switched.ratification.tallies).toEqual({
      for: 0,
      against: 1,
      totalUserCount: 2,
    });

    const retracted = await upsertAnnotationRatification({
      annotationId: annotation.id,
      actorId: bob.id,
      stance: null,
    });
    expect(retracted.ratification.myStance).toBeNull();
    expect(retracted.ratification.tallies).toEqual({
      for: 0,
      against: 0,
      totalUserCount: 2,
    });

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, annotation.id));
    const ratificationEvents = events.filter(
      (event) => event.type === "annotation.ratification.updated",
    );
    expect(ratificationEvents).toHaveLength(3);
    expect(ratificationEvents[0]?.payload).toMatchObject({
      annotationId: annotation.id,
      stance: "for",
      tallies: { for: 1, against: 0, totalUserCount: 2 },
    });
    expect(ratificationEvents[2]?.payload).toMatchObject({
      stance: null,
      ratificationId: null,
      tallies: { for: 0, against: 0, totalUserCount: 2 },
    });
    expect(
      events.some((event) => event.type === "annotation.ratification.resolved"),
    ).toBe(false);
  });

  it("forbids the author from ratifying", async () => {
    const { alice, conversation, call } = await seedCall();
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[0].id,
      startOffsetMs: 0,
      endOffsetMs: 0,
    });

    await expect(
      upsertAnnotationRatification({
        annotationId: annotation.id,
        actorId: alice.id,
        stance: "for",
      }),
    ).rejects.toBeInstanceOf(AnnotationForbiddenError);
  });

  it("derives live remainder as totalUserCount minus for and against", async () => {
    const { alice, bob, conversation, call } = await seedCall();
    const carol = await createUser("Carol");
    await addConversationMember(conversation.id, carol.id);
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[0].id,
      startOffsetMs: 0,
      endOffsetMs: 0,
    });

    await upsertAnnotationRatification({
      annotationId: annotation.id,
      actorId: bob.id,
      stance: "for",
    });

    const listed = await serializeAnnotationForViewer(annotation, bob.id);
    expect(listed.ratification.tallies).toEqual({
      for: 1,
      against: 0,
      totalUserCount: 3,
    });
    expect(
      listed.ratification.tallies.totalUserCount -
        (listed.ratification.tallies.for + listed.ratification.tallies.against),
    ).toBe(2);
  });

  it("stays open when no democracy model is registered", async () => {
    const { alice, bob, conversation, call } = await seedCall();
    const carol = await createUser("Carol");
    await addConversationMember(conversation.id, carol.id);
    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[0].id,
      startOffsetMs: 0,
      endOffsetMs: 0,
    });

    await upsertAnnotationRatification({
      annotationId: annotation.id,
      actorId: bob.id,
      stance: "for",
    });
    const second = await upsertAnnotationRatification({
      annotationId: annotation.id,
      actorId: carol.id,
      stance: "for",
    });
    expect(second.ratification.outcome).toEqual({ status: "open" });
  });

  it("latches a snapshot at decision time and does not recompute after membership changes", async () => {
    const { alice, bob, conversation, call } = await seedCall();
    const carol = await createUser("Carol");
    await addConversationMember(conversation.id, carol.id);

    democracyRegistry.register({
      key: SIMPLE_MAJORITY_KEY,
      evaluate: (tally) =>
        tally.for >= 2 ? { status: "ratified" } : { status: "undecided" },
    });

    const annotation = await createCallAnnotation({
      callId: call.id,
      conversationId: conversation.id,
      createdBy: alice.id,
      profileId: SEEDED_ANNOTATION_PROFILES[0].id,
      startOffsetMs: 0,
      endOffsetMs: 0,
    });

    await upsertAnnotationRatification({
      annotationId: annotation.id,
      actorId: bob.id,
      stance: "for",
    });
    const latched = await upsertAnnotationRatification({
      annotationId: annotation.id,
      actorId: carol.id,
      stance: "for",
    });

    expect(latched.ratification.outcome.status).toBe("ratified");
    if (latched.ratification.outcome.status !== "ratified") {
      throw new Error("expected latched outcome");
    }
    expect(latched.ratification.outcome.snapshot).toEqual({
      modelKey: SIMPLE_MAJORITY_KEY,
      for: 2,
      against: 0,
      totalUserCount: 3,
    });

    const dave = await createUser("Dave");
    await addConversationMember(conversation.id, dave.id);
    const afterJoin = await upsertAnnotationRatification({
      annotationId: annotation.id,
      actorId: dave.id,
      stance: "for",
    });

    expect(afterJoin.ratification.tallies).toEqual({
      for: 3,
      against: 0,
      totalUserCount: 4,
    });
    expect(afterJoin.ratification.outcome).toEqual(
      latched.ratification.outcome,
    );

    const [row] = await db
      .select({
        status: callAnnotations.ratificationStatus,
        snapshot: callAnnotations.ratificationSnapshot,
      })
      .from(callAnnotations)
      .where(eq(callAnnotations.id, annotation.id));
    expect(row?.status).toBe("ratified");
    expect(row?.snapshot).toEqual({
      modelKey: SIMPLE_MAJORITY_KEY,
      for: 2,
      against: 0,
      totalUserCount: 3,
    });

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, annotation.id));
    expect(
      events.filter((event) => event.type === "annotation.ratification.resolved"),
    ).toHaveLength(1);
  });
});
