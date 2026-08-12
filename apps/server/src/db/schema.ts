import {
    pgTable,
    text,
    timestamp,
    primaryKey,
    uuid,
  } from "drizzle-orm/pg-core";
  
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