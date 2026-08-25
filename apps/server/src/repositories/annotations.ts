import { and, asc, eq } from "drizzle-orm";

import { db } from "../database.js";
import {
  annotationProfiles,
  callAnnotations,
  callSelections,
  outboxEvents,
  users,
} from "../db/schema.js";

export const SELECTION_MIN_WIDTH_MS = 50;

export const SEEDED_ANNOTATION_PROFILES = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    key: "decision",
    name: "Decision",
    color: "#f59e0b",
    icon: "gavel",
    sortOrder: 1,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    key: "action",
    name: "Action",
    color: "#38bdf8",
    icon: "flag",
    sortOrder: 2,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    key: "question",
    name: "Question",
    color: "#c084fc",
    icon: "help-outline",
    sortOrder: 3,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    key: "agreement",
    name: "Agreement",
    color: "#4ade80",
    icon: "check-circle",
    sortOrder: 4,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    key: "concern",
    name: "Concern",
    color: "#fb7185",
    icon: "warning",
    sortOrder: 5,
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    key: "highlight",
    name: "Highlight",
    color: "#facc15",
    icon: "star",
    sortOrder: 6,
  },
] as const;

export class AnnotationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnotationValidationError";
  }
}

export class AnnotationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnotationConflictError";
  }
}

export class AnnotationForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnotationForbiddenError";
  }
}

export type AnnotationProfileRecord = {
  id: string;
  key: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
};

export type AnnotationActor = {
  id: string;
  displayName: string;
};

export type CallSelectionRecord = {
  id: string;
  callId: string;
  conversationId: string;
  createdBy: AnnotationActor;
  startOffsetMs: number;
  endOffsetMs: number;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CallAnnotationRecord = {
  id: string;
  callId: string;
  conversationId: string;
  createdBy: AnnotationActor;
  profile: AnnotationProfileRecord;
  note: string | null;
  startOffsetMs: number;
  endOffsetMs: number;
  userId: string | null;
  selectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function assertSelectionRange(startOffsetMs: number, endOffsetMs: number): void {
  if (endOffsetMs < startOffsetMs) {
    throw new AnnotationValidationError("endOffsetMs must be >= startOffsetMs");
  }

  if (endOffsetMs - startOffsetMs < SELECTION_MIN_WIDTH_MS) {
    throw new AnnotationValidationError(
      `Selection must be at least ${SELECTION_MIN_WIDTH_MS}ms`,
    );
  }
}

function assertAnnotationRange(startOffsetMs: number, endOffsetMs: number): void {
  if (endOffsetMs < startOffsetMs) {
    throw new AnnotationValidationError("endOffsetMs must be >= startOffsetMs");
  }

  if (
    endOffsetMs !== startOffsetMs &&
    endOffsetMs - startOffsetMs < SELECTION_MIN_WIDTH_MS
  ) {
    throw new AnnotationValidationError(
      `Ranged annotation must be at least ${SELECTION_MIN_WIDTH_MS}ms`,
    );
  }
}

function mapProfile(row: {
  id: string;
  key: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}): AnnotationProfileRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sortOrder,
  };
}

function annotationEventPayload(record: CallAnnotationRecord) {
  return {
    annotationId: record.id,
    callId: record.callId,
    profile: {
      id: record.profile.id,
      key: record.profile.key,
      name: record.profile.name,
      color: record.profile.color,
      icon: record.profile.icon,
    },
    note: record.note,
    startOffsetMs: record.startOffsetMs,
    endOffsetMs: record.endOffsetMs,
    userId: record.userId,
    selectionId: record.selectionId,
    createdBy: record.createdBy,
  };
}

function selectionEventPayload(record: CallSelectionRecord) {
  return {
    selectionId: record.id,
    callId: record.callId,
    startOffsetMs: record.startOffsetMs,
    endOffsetMs: record.endOffsetMs,
    userId: record.userId,
  };
}

export function serializeAnnotation(record: CallAnnotationRecord) {
  return {
    id: record.id,
    callId: record.callId,
    conversationId: record.conversationId,
    createdBy: record.createdBy,
    profile: record.profile,
    note: record.note,
    startOffsetMs: record.startOffsetMs,
    endOffsetMs: record.endOffsetMs,
    userId: record.userId,
    selectionId: record.selectionId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function serializeSelection(record: CallSelectionRecord) {
  return {
    id: record.id,
    callId: record.callId,
    conversationId: record.conversationId,
    createdBy: record.createdBy,
    startOffsetMs: record.startOffsetMs,
    endOffsetMs: record.endOffsetMs,
    userId: record.userId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listAnnotationProfiles(): Promise<
  AnnotationProfileRecord[]
> {
  const rows = await db
    .select()
    .from(annotationProfiles)
    .orderBy(asc(annotationProfiles.sortOrder));

  return rows.map(mapProfile);
}

export async function getAnnotationProfileById(
  profileId: string,
): Promise<AnnotationProfileRecord | null> {
  const [row] = await db
    .select()
    .from(annotationProfiles)
    .where(eq(annotationProfiles.id, profileId))
    .limit(1);

  return row ? mapProfile(row) : null;
}

export async function listCallSelections(
  callId: string,
): Promise<CallSelectionRecord[]> {
  const rows = await db
    .select({
      id: callSelections.id,
      callId: callSelections.callId,
      conversationId: callSelections.conversationId,
      createdById: callSelections.createdBy,
      createdByName: users.displayName,
      startOffsetMs: callSelections.startOffsetMs,
      endOffsetMs: callSelections.endOffsetMs,
      userId: callSelections.userId,
      createdAt: callSelections.createdAt,
      updatedAt: callSelections.updatedAt,
    })
    .from(callSelections)
    .innerJoin(users, eq(callSelections.createdBy, users.id))
    .where(eq(callSelections.callId, callId))
    .orderBy(asc(callSelections.startOffsetMs), asc(callSelections.id));

  return rows.map((row) => ({
    id: row.id,
    callId: row.callId,
    conversationId: row.conversationId,
    createdBy: { id: row.createdById, displayName: row.createdByName },
    startOffsetMs: row.startOffsetMs,
    endOffsetMs: row.endOffsetMs,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getCallSelectionById(
  selectionId: string,
): Promise<CallSelectionRecord | null> {
  const [row] = await db
    .select({
      id: callSelections.id,
      callId: callSelections.callId,
      conversationId: callSelections.conversationId,
      createdById: callSelections.createdBy,
      createdByName: users.displayName,
      startOffsetMs: callSelections.startOffsetMs,
      endOffsetMs: callSelections.endOffsetMs,
      userId: callSelections.userId,
      createdAt: callSelections.createdAt,
      updatedAt: callSelections.updatedAt,
    })
    .from(callSelections)
    .innerJoin(users, eq(callSelections.createdBy, users.id))
    .where(eq(callSelections.id, selectionId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    callId: row.callId,
    conversationId: row.conversationId,
    createdBy: { id: row.createdById, displayName: row.createdByName },
    startOffsetMs: row.startOffsetMs,
    endOffsetMs: row.endOffsetMs,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createCallSelection(input: {
  callId: string;
  conversationId: string;
  createdBy: string;
  startOffsetMs: number;
  endOffsetMs: number;
  userId?: string | null;
}): Promise<CallSelectionRecord> {
  assertSelectionRange(input.startOffsetMs, input.endOffsetMs);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(callSelections)
      .values({
        callId: input.callId,
        conversationId: input.conversationId,
        createdBy: input.createdBy,
        startOffsetMs: input.startOffsetMs,
        endOffsetMs: input.endOffsetMs,
        userId: input.userId ?? null,
      })
      .returning();

    const [actor] = await tx
      .select({
        id: users.id,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, input.createdBy))
      .limit(1);

    const record: CallSelectionRecord = {
      id: row.id,
      callId: row.callId,
      conversationId: row.conversationId,
      createdBy: {
        id: actor?.id ?? input.createdBy,
        displayName: actor?.displayName ?? "Unknown",
      },
      startOffsetMs: row.startOffsetMs,
      endOffsetMs: row.endOffsetMs,
      userId: row.userId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    await tx.insert(outboxEvents).values({
      type: "selection.created",
      aggregateType: "selection",
      aggregateId: record.id,
      conversationId: input.conversationId,
      actorId: input.createdBy,
      payload: selectionEventPayload(record),
    });

    return record;
  });
}

export async function updateCallSelection(input: {
  selectionId: string;
  actorId: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
  userId?: string | null;
}): Promise<CallSelectionRecord> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(callSelections)
      .where(eq(callSelections.id, input.selectionId))
      .limit(1);

    if (!existing) {
      throw new AnnotationValidationError("Selection not found");
    }

    if (existing.createdBy !== input.actorId) {
      throw new AnnotationForbiddenError("Only the author can update this selection");
    }

    const startOffsetMs = input.startOffsetMs ?? existing.startOffsetMs;
    const endOffsetMs = input.endOffsetMs ?? existing.endOffsetMs;
    const userId =
      input.userId === undefined ? existing.userId : input.userId;
    assertSelectionRange(startOffsetMs, endOffsetMs);

    const now = new Date();
    const [row] = await tx
      .update(callSelections)
      .set({
        startOffsetMs,
        endOffsetMs,
        userId,
        updatedAt: now,
      })
      .where(eq(callSelections.id, input.selectionId))
      .returning();

    const [actor] = await tx
      .select({
        id: users.id,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, existing.createdBy))
      .limit(1);

    const record: CallSelectionRecord = {
      id: row.id,
      callId: row.callId,
      conversationId: row.conversationId,
      createdBy: {
        id: actor?.id ?? existing.createdBy,
        displayName: actor?.displayName ?? "Unknown",
      },
      startOffsetMs: row.startOffsetMs,
      endOffsetMs: row.endOffsetMs,
      userId: row.userId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    await tx.insert(outboxEvents).values({
      type: "selection.updated",
      aggregateType: "selection",
      aggregateId: record.id,
      conversationId: record.conversationId,
      actorId: input.actorId,
      payload: selectionEventPayload(record),
    });

    const [linked] = await tx
      .select({ id: callAnnotations.id })
      .from(callAnnotations)
      .where(eq(callAnnotations.selectionId, record.id))
      .limit(1);

    if (linked) {
      await tx
        .update(callAnnotations)
        .set({
          startOffsetMs: record.startOffsetMs,
          endOffsetMs: record.endOffsetMs,
          userId: record.userId,
          updatedAt: now,
        })
        .where(eq(callAnnotations.id, linked.id));

      const synced = await loadAnnotationInTx(tx, linked.id);
      if (synced) {
        await tx.insert(outboxEvents).values({
          type: "annotation.updated",
          aggregateType: "annotation",
          aggregateId: synced.id,
          conversationId: synced.conversationId,
          actorId: input.actorId,
          payload: annotationEventPayload(synced),
        });
      }
    }

    return record;
  });
}

export async function deleteCallSelection(input: {
  selectionId: string;
  actorId: string;
}): Promise<CallSelectionRecord> {
  return db.transaction(async (tx) => {
    const existing = await getCallSelectionById(input.selectionId);
    if (!existing) {
      throw new AnnotationValidationError("Selection not found");
    }

    if (existing.createdBy.id !== input.actorId) {
      throw new AnnotationForbiddenError("Only the author can delete this selection");
    }

    await tx
      .delete(callSelections)
      .where(eq(callSelections.id, input.selectionId));

    await tx.insert(outboxEvents).values({
      type: "selection.deleted",
      aggregateType: "selection",
      aggregateId: existing.id,
      conversationId: existing.conversationId,
      actorId: input.actorId,
      payload: {
        selectionId: existing.id,
        callId: existing.callId,
      },
    });

    return existing;
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadAnnotationInTx(
  tx: Tx,
  annotationId: string,
): Promise<CallAnnotationRecord | null> {
  const [row] = await tx
    .select({
      id: callAnnotations.id,
      callId: callAnnotations.callId,
      conversationId: callAnnotations.conversationId,
      createdById: callAnnotations.createdBy,
      createdByName: users.displayName,
      note: callAnnotations.note,
      startOffsetMs: callAnnotations.startOffsetMs,
      endOffsetMs: callAnnotations.endOffsetMs,
      userId: callAnnotations.userId,
      selectionId: callAnnotations.selectionId,
      createdAt: callAnnotations.createdAt,
      updatedAt: callAnnotations.updatedAt,
      profileId: annotationProfiles.id,
      profileKey: annotationProfiles.key,
      profileName: annotationProfiles.name,
      profileColor: annotationProfiles.color,
      profileIcon: annotationProfiles.icon,
      profileSortOrder: annotationProfiles.sortOrder,
    })
    .from(callAnnotations)
    .innerJoin(users, eq(callAnnotations.createdBy, users.id))
    .innerJoin(
      annotationProfiles,
      eq(callAnnotations.profileId, annotationProfiles.id),
    )
    .where(eq(callAnnotations.id, annotationId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    callId: row.callId,
    conversationId: row.conversationId,
    createdBy: { id: row.createdById, displayName: row.createdByName },
    profile: {
      id: row.profileId,
      key: row.profileKey,
      name: row.profileName,
      color: row.profileColor,
      icon: row.profileIcon,
      sortOrder: row.profileSortOrder,
    },
    note: row.note,
    startOffsetMs: row.startOffsetMs,
    endOffsetMs: row.endOffsetMs,
    userId: row.userId,
    selectionId: row.selectionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCallAnnotations(
  callId: string,
): Promise<CallAnnotationRecord[]> {
  const rows = await db
    .select({
      id: callAnnotations.id,
      callId: callAnnotations.callId,
      conversationId: callAnnotations.conversationId,
      createdById: callAnnotations.createdBy,
      createdByName: users.displayName,
      note: callAnnotations.note,
      startOffsetMs: callAnnotations.startOffsetMs,
      endOffsetMs: callAnnotations.endOffsetMs,
      userId: callAnnotations.userId,
      selectionId: callAnnotations.selectionId,
      createdAt: callAnnotations.createdAt,
      updatedAt: callAnnotations.updatedAt,
      profileId: annotationProfiles.id,
      profileKey: annotationProfiles.key,
      profileName: annotationProfiles.name,
      profileColor: annotationProfiles.color,
      profileIcon: annotationProfiles.icon,
      profileSortOrder: annotationProfiles.sortOrder,
    })
    .from(callAnnotations)
    .innerJoin(users, eq(callAnnotations.createdBy, users.id))
    .innerJoin(
      annotationProfiles,
      eq(callAnnotations.profileId, annotationProfiles.id),
    )
    .where(eq(callAnnotations.callId, callId))
    .orderBy(asc(callAnnotations.startOffsetMs), asc(callAnnotations.id));

  return rows.map((row) => ({
    id: row.id,
    callId: row.callId,
    conversationId: row.conversationId,
    createdBy: { id: row.createdById, displayName: row.createdByName },
    profile: {
      id: row.profileId,
      key: row.profileKey,
      name: row.profileName,
      color: row.profileColor,
      icon: row.profileIcon,
      sortOrder: row.profileSortOrder,
    },
    note: row.note,
    startOffsetMs: row.startOffsetMs,
    endOffsetMs: row.endOffsetMs,
    userId: row.userId,
    selectionId: row.selectionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getCallAnnotationById(
  annotationId: string,
): Promise<CallAnnotationRecord | null> {
  return loadAnnotationInTx(db as unknown as Tx, annotationId);
}

export async function createCallAnnotation(input: {
  callId: string;
  conversationId: string;
  createdBy: string;
  profileId: string;
  selectionId?: string | null;
  startOffsetMs?: number;
  endOffsetMs?: number;
  userId?: string | null;
}): Promise<CallAnnotationRecord> {
  const profile = await getAnnotationProfileById(input.profileId);
  if (!profile) {
    throw new AnnotationValidationError("Unknown annotation profile");
  }

  return db.transaction(async (tx) => {
    let startOffsetMs = input.startOffsetMs;
    let endOffsetMs = input.endOffsetMs;
    let userId = input.userId ?? null;
    let selectionId = input.selectionId ?? null;

    if (selectionId) {
      const [selection] = await tx
        .select()
        .from(callSelections)
        .where(
          and(
            eq(callSelections.id, selectionId),
            eq(callSelections.callId, input.callId),
          ),
        )
        .limit(1);

      if (!selection) {
        throw new AnnotationValidationError("Selection not found");
      }

      const [taken] = await tx
        .select({ id: callAnnotations.id })
        .from(callAnnotations)
        .where(eq(callAnnotations.selectionId, selectionId))
        .limit(1);

      if (taken) {
        throw new AnnotationConflictError(
          "Selection is already linked to an annotation",
        );
      }

      startOffsetMs = selection.startOffsetMs;
      endOffsetMs = selection.endOffsetMs;
      userId = selection.userId;
    }

    if (startOffsetMs === undefined || endOffsetMs === undefined) {
      throw new AnnotationValidationError(
        "startOffsetMs and endOffsetMs are required without a selection",
      );
    }

    assertAnnotationRange(startOffsetMs, endOffsetMs);

    const [row] = await tx
      .insert(callAnnotations)
      .values({
        callId: input.callId,
        conversationId: input.conversationId,
        createdBy: input.createdBy,
        profileId: input.profileId,
        note: null,
        startOffsetMs,
        endOffsetMs,
        userId,
        selectionId,
      })
      .returning();

    const record = await loadAnnotationInTx(tx, row.id);
    if (!record) {
      throw new Error("Failed to load created annotation");
    }

    await tx.insert(outboxEvents).values({
      type: "annotation.created",
      aggregateType: "annotation",
      aggregateId: record.id,
      conversationId: input.conversationId,
      actorId: input.createdBy,
      payload: annotationEventPayload(record),
    });

    return record;
  });
}

export async function updateCallAnnotation(input: {
  annotationId: string;
  actorId: string;
  note?: string | null;
  selectionId?: string | null;
}): Promise<CallAnnotationRecord> {
  return db.transaction(async (tx) => {
    const existing = await loadAnnotationInTx(tx, input.annotationId);
    if (!existing) {
      throw new AnnotationValidationError("Annotation not found");
    }

    if (existing.createdBy.id !== input.actorId) {
      throw new AnnotationForbiddenError(
        "Only the author can update this annotation",
      );
    }

    let startOffsetMs = existing.startOffsetMs;
    let endOffsetMs = existing.endOffsetMs;
    let userId = existing.userId;
    let selectionId = existing.selectionId;
    const note = input.note === undefined ? existing.note : input.note;

    if (input.selectionId !== undefined) {
      if (input.selectionId === null) {
        selectionId = null;
      } else {
        const [selection] = await tx
          .select()
          .from(callSelections)
          .where(
            and(
              eq(callSelections.id, input.selectionId),
              eq(callSelections.callId, existing.callId),
            ),
          )
          .limit(1);

        if (!selection) {
          throw new AnnotationValidationError("Selection not found");
        }

        const [taken] = await tx
          .select({ id: callAnnotations.id })
          .from(callAnnotations)
          .where(eq(callAnnotations.selectionId, input.selectionId))
          .limit(1);

        if (taken && taken.id !== existing.id) {
          throw new AnnotationConflictError(
            "Selection is already linked to an annotation",
          );
        }

        selectionId = selection.id;
        startOffsetMs = selection.startOffsetMs;
        endOffsetMs = selection.endOffsetMs;
        userId = selection.userId;
      }
    }

    await tx
      .update(callAnnotations)
      .set({
        note,
        startOffsetMs,
        endOffsetMs,
        userId,
        selectionId,
        updatedAt: new Date(),
      })
      .where(eq(callAnnotations.id, input.annotationId));

    const record = await loadAnnotationInTx(tx, input.annotationId);
    if (!record) {
      throw new Error("Failed to load updated annotation");
    }

    await tx.insert(outboxEvents).values({
      type: "annotation.updated",
      aggregateType: "annotation",
      aggregateId: record.id,
      conversationId: record.conversationId,
      actorId: input.actorId,
      payload: annotationEventPayload(record),
    });

    return record;
  });
}

export async function deleteCallAnnotation(input: {
  annotationId: string;
  actorId: string;
}): Promise<CallAnnotationRecord> {
  return db.transaction(async (tx) => {
    const existing = await loadAnnotationInTx(tx, input.annotationId);
    if (!existing) {
      throw new AnnotationValidationError("Annotation not found");
    }

    if (existing.createdBy.id !== input.actorId) {
      throw new AnnotationForbiddenError(
        "Only the author can delete this annotation",
      );
    }

    await tx
      .delete(callAnnotations)
      .where(eq(callAnnotations.id, input.annotationId));

    await tx.insert(outboxEvents).values({
      type: "annotation.deleted",
      aggregateType: "annotation",
      aggregateId: existing.id,
      conversationId: existing.conversationId,
      actorId: input.actorId,
      payload: {
        annotationId: existing.id,
        callId: existing.callId,
      },
    });

    return existing;
  });
}
