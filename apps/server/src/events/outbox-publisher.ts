import type { MessageCreatedEvent } from "@d3-arcana/events";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "../database.js";
import { outboxEvents } from "../db/schema.js";
import { eventBus } from "./event-bus-instance.js";

const BATCH_SIZE = 10;
const LEASE_DURATION_SECONDS = 60;

export async function publishPendingEvents(): Promise<void> {
  const events = await claimPendingEvents();

  for (const record of events) {
    try {
      if (record.type !== "message.created") {
        console.error(`Unknown event type: ${record.type}`);
        continue;
      }

      const event: MessageCreatedEvent = {
        eventId: record.id,
        type: "message.created",
        timestamp: record.createdAt.toISOString(),
        conversationId: record.conversationId,
        actorId: record.actorId,
        payload: record.payload as MessageCreatedEvent["payload"],
      };

      await eventBus.publish(event);

      await db
        .update(outboxEvents)
        .set({
          publishedAt: new Date(),
        })
        .where(
          and(
            eq(outboxEvents.id, record.id),
            isNull(outboxEvents.publishedAt),
          ),
        );
    } catch (error) {
      console.error(
        `Failed to publish event ${record.id}:`,
        error,
      );
    }
  }
}

async function claimPendingEvents() {
  const now = new Date();

  const leaseExpiry = new Date(
    now.getTime() - LEASE_DURATION_SECONDS * 1000,
  );

  return db.transaction(async (tx) => {
    const events = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          isNull(outboxEvents.publishedAt),
          or(
            isNull(outboxEvents.claimedAt),
            lt(outboxEvents.claimedAt, leaseExpiry),
          ),
        ),
      )
      .orderBy(outboxEvents.createdAt)
      .limit(BATCH_SIZE)
      .for("update", {
        skipLocked: true,
      });

    if (events.length === 0) {
      return [];
    }

    const ids = events.map((event) => event.id);

    await tx
      .update(outboxEvents)
      .set({
        claimedAt: now,
      })
      .where(
        sql`${outboxEvents.id} IN ${ids}`,
      );

    return events.map((event) => ({
      ...event,
      claimedAt: now,
    }));
  });
}