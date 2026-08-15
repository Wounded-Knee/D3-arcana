import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "../database.js";
import {
  callParticipantSessions,
  callParticipants,
  calls,
  outboxEvents,
  users,
} from "../db/schema.js";
import type { JoinRole, MediaMode } from "../media/types.js";

export interface CallRecord {
  id: string;
  conversationId: string;
  startedBy: string;
  status: string;
  mediaMode: string;
  startedAt: Date;
  endedAt: Date | null;
}

export interface ActiveCallParticipant {
  userId: string;
  role: string;
  displayName: string;
  joinedAt: Date;
}

export interface ActiveCallWithParticipants {
  call: CallRecord;
  participants: ActiveCallParticipant[];
}

export async function getActiveCallForConversation(
  conversationId: string,
): Promise<CallRecord | null> {
  const [call] = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.conversationId, conversationId),
        eq(calls.status, "active"),
      ),
    )
    .limit(1);

  return call ?? null;
}

export async function getCallById(callId: string): Promise<CallRecord | null> {
  const [call] = await db
    .select()
    .from(calls)
    .where(eq(calls.id, callId))
    .limit(1);

  return call ?? null;
}

export async function createCall(
  conversationId: string,
  startedBy: string,
  mediaMode: MediaMode = "audio",
): Promise<CallRecord> {
  return db.transaction(async (tx) => {
    const [call] = await tx
      .insert(calls)
      .values({
        conversationId,
        startedBy,
        status: "active",
        mediaMode,
      })
      .returning();

    await tx.insert(outboxEvents).values({
      type: "call.started",
      aggregateType: "call",
      aggregateId: call.id,
      conversationId,
      actorId: startedBy,
      payload: {
        callId: call.id,
        mediaMode,
      },
    });

    return call;
  });
}

export async function endCall(
  callId: string,
  actorId: string,
  reason?: string,
): Promise<CallRecord | null> {
  return db.transaction(async (tx) => {
    const [call] = await tx
      .update(calls)
      .set({
        status: "ended",
        endedAt: new Date(),
      })
      .where(and(eq(calls.id, callId), eq(calls.status, "active")))
      .returning();

    if (!call) {
      return null;
    }

    await tx
      .update(callParticipantSessions)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(callParticipantSessions.callId, callId),
          isNull(callParticipantSessions.leftAt),
        ),
      );

    await tx.insert(outboxEvents).values({
      type: "call.ended",
      aggregateType: "call",
      aggregateId: call.id,
      conversationId: call.conversationId,
      actorId,
      payload: {
        callId: call.id,
        ...(reason ? { reason } : {}),
      },
    });

    return call;
  });
}

export async function upsertParticipantJoined(
  callId: string,
  conversationId: string,
  userId: string,
  role: JoinRole,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(callParticipants)
      .where(
        and(
          eq(callParticipants.callId, callId),
          eq(callParticipants.userId, userId),
        ),
      )
      .limit(1);

    const wasActive = existing?.leftAt === null;

    if (existing) {
      await tx
        .update(callParticipants)
        .set({
          role,
          leftAt: null,
          joinedAt: wasActive ? existing.joinedAt : new Date(),
        })
        .where(
          and(
            eq(callParticipants.callId, callId),
            eq(callParticipants.userId, userId),
          ),
        );
    } else {
      await tx.insert(callParticipants).values({
        callId,
        userId,
        role,
      });
    }

    if (wasActive) {
      return false;
    }

    await tx.insert(callParticipantSessions).values({
      callId,
      userId,
    });

    await tx.insert(outboxEvents).values({
      type: "call.participant.joined",
      aggregateType: "call",
      aggregateId: callId,
      conversationId,
      actorId: userId,
      payload: {
        callId,
        userId,
        role,
      },
    });

    return true;
  });
}

export async function markParticipantLeft(
  callId: string,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(callParticipants)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(callParticipants.callId, callId),
          eq(callParticipants.userId, userId),
          isNull(callParticipants.leftAt),
        ),
      )
      .returning();

    if (!updated) {
      return false;
    }

    await tx
      .update(callParticipantSessions)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(callParticipantSessions.callId, callId),
          eq(callParticipantSessions.userId, userId),
          isNull(callParticipantSessions.leftAt),
        ),
      );

    await tx.insert(outboxEvents).values({
      type: "call.participant.left",
      aggregateType: "call",
      aggregateId: callId,
      conversationId,
      actorId: userId,
      payload: {
        callId,
        userId,
      },
    });

    return true;
  });
}

export async function listActiveParticipants(
  callId: string,
): Promise<ActiveCallParticipant[]> {
  const rows = await db
    .select({
      userId: callParticipants.userId,
      role: callParticipants.role,
      joinedAt: callParticipants.joinedAt,
      displayName: users.displayName,
    })
    .from(callParticipants)
    .innerJoin(users, eq(callParticipants.userId, users.id))
    .where(
      and(
        eq(callParticipants.callId, callId),
        isNull(callParticipants.leftAt),
      ),
    );

  return rows;
}

export async function countActiveParticipants(callId: string): Promise<number> {
  const participants = await listActiveParticipants(callId);
  return participants.length;
}

export async function getActiveCallWithParticipants(
  conversationId: string,
): Promise<ActiveCallWithParticipants | null> {
  const call = await getActiveCallForConversation(conversationId);
  if (!call) {
    return null;
  }

  const participants = await listActiveParticipants(call.id);
  return { call, participants };
}

export async function isActiveCallParticipant(
  callId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: callParticipants.userId })
    .from(callParticipants)
    .where(
      and(
        eq(callParticipants.callId, callId),
        eq(callParticipants.userId, userId),
        isNull(callParticipants.leftAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export interface CallParticipantSessionRecord {
  id: string;
  callId: string;
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
}

export async function listCallParticipantSessions(
  callId: string,
): Promise<CallParticipantSessionRecord[]> {
  return db
    .select()
    .from(callParticipantSessions)
    .where(eq(callParticipantSessions.callId, callId))
    .orderBy(asc(callParticipantSessions.joinedAt));
}
