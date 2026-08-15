import { sql } from "drizzle-orm";

import { db, pool } from "../../database.js";

export async function truncateAll(): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      event_consumptions,
      outbox_events,
      call_waveform_chunks,
      call_participant_sessions,
      call_participants,
      calls,
      messages,
      conversation_members,
      conversations,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function closePool(): Promise<void> {
  await pool.end();
}
