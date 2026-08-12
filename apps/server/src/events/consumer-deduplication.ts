import { and, eq } from "drizzle-orm";

import { db } from "../database.js";
import { eventConsumptions } from "../db/schema.js";

export async function hasProcessedEvent(
  consumer: string,
  eventId: string,
): Promise<boolean> {
  const result = await db
    .select()
    .from(eventConsumptions)
    .where(
      and(
        eq(eventConsumptions.consumer, consumer),
        eq(eventConsumptions.eventId, eventId),
      ),
    )
    .limit(1);

  return result.length > 0;
}

export async function markEventProcessed(
  consumer: string,
  eventId: string,
): Promise<void> {
  await db
    .insert(eventConsumptions)
    .values({
      consumer,
      eventId,
    })
    .onConflictDoNothing();
}