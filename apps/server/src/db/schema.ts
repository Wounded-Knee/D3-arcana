import {
    jsonb,
    pgTable,
    text,
    timestamp,
    primaryKey,
    uuid,
  } from "drizzle-orm/pg-core";
  
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