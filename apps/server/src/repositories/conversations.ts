import { and, asc, eq } from "drizzle-orm";
import { db } from "../database.js";
import {
  conversations,
  conversationMembers,
  users,
} from "../db/schema.js";

export async function createConversation(
  name: string,
  createdBy: string,
) {
  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        name,
        createdBy,
      })
      .returning();

    await tx.insert(conversationMembers).values({
      conversationId: conversation.id,
      userId: createdBy,
    });

    return conversation;
  });
}

export async function getConversationById(
  conversationId: string,
) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  return conversation ?? null;
}

export async function getConversationMembers(
  conversationId: string,
) {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
    })
    .from(conversationMembers)
    .innerJoin(
      users,
      eq(users.id, conversationMembers.userId),
    )
    .where(
      eq(
        conversationMembers.conversationId,
        conversationId,
      ),
    );
}

export async function getConversationsForUser(userId: string) {
  return db
    .select({
      id: conversations.id,
      name: conversations.name,
      createdBy: conversations.createdBy,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .innerJoin(
      conversationMembers,
      eq(conversationMembers.conversationId, conversations.id),
    )
    .where(eq(conversationMembers.userId, userId))
    .orderBy(asc(conversations.createdAt));
}

export async function isConversationMember(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const [membership] = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);

  return membership !== undefined;
}

export async function addConversationMember(
  conversationId: string,
  userId: string,
) {
  const [membership] = await db
    .insert(conversationMembers)
    .values({
      conversationId,
      userId,
    })
    .onConflictDoNothing()
    .returning();

  if (membership) {
    return membership;
  }

  const [existing] = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);

  return existing ?? null;
}
