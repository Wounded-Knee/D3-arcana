import { sql } from "drizzle-orm";
import {
    jsonb,
    pgTable,
    text,
    timestamp,
    primaryKey,
    uniqueIndex,
    uuid,
  } from "drizzle-orm/pg-core";
  
  export const eventConsumptions = pgTable(
    "event_consumptions",
    {
      consumer: text("consumer").notNull(),
  
      eventId: uuid("event_id").notNull(),
  
      processedAt: timestamp("processed_at", {
        withTimezone: true,
      }).defaultNow().notNull(),
    },
    (table) => [
      primaryKey({
        columns: [table.consumer, table.eventId],
      }),
    ],
  );
  
  export const outboxEvents = pgTable("outbox_events", {
    id: uuid("id").defaultRandom().primaryKey(),
  
    type: text("type").notNull(),
  
    aggregateType: text("aggregate_type").notNull(),
  
    aggregateId: uuid("aggregate_id").notNull(),
  
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, {
        onDelete: "cascade",
      }),
  
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
  
    payload: jsonb("payload").notNull(),
    
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  
    publishedAt: timestamp("published_at", {
      withTimezone: true,
    }),
  });

  export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  });
  
  export const conversations = pgTable("conversations", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  });
  
  export const conversationMembers = pgTable(
    "conversation_members",
    {
      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, {
          onDelete: "cascade",
        }),
  
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, {
          onDelete: "cascade",
        }),
  
      joinedAt: timestamp("joined_at", {
        withTimezone: true,
      }).defaultNow().notNull(),
    },
    (table) => [
      primaryKey({
        columns: [table.conversationId, table.userId],
      }),
    ],
  );
  
  export const messages = pgTable("messages", {
    id: uuid("id").defaultRandom().primaryKey(),
  
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, {
        onDelete: "cascade",
      }),
  
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
  
    content: text("content").notNull(),
  
    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  
    editedAt: timestamp("edited_at", {
      withTimezone: true,
    }),
  
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
    }),
  });

  export const calls = pgTable(
    "calls",
    {
      id: uuid("id").defaultRandom().primaryKey(),

      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, {
          onDelete: "cascade",
        }),

      startedBy: uuid("started_by")
        .notNull()
        .references(() => users.id),

      status: text("status").notNull(),

      mediaMode: text("media_mode").notNull(),

      startedAt: timestamp("started_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      endedAt: timestamp("ended_at", {
        withTimezone: true,
      }),
    },
    (table) => [
      uniqueIndex("calls_one_active_per_conversation_idx")
        .on(table.conversationId)
        .where(sql`${table.status} = 'active'`),
    ],
  );

  export const callParticipants = pgTable(
    "call_participants",
    {
      callId: uuid("call_id")
        .notNull()
        .references(() => calls.id, {
          onDelete: "cascade",
        }),

      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, {
          onDelete: "cascade",
        }),

      role: text("role").notNull(),

      joinedAt: timestamp("joined_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      leftAt: timestamp("left_at", {
        withTimezone: true,
      }),
    },
    (table) => [
      primaryKey({
        columns: [table.callId, table.userId],
      }),
    ],
  );