import { eq } from "drizzle-orm";
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