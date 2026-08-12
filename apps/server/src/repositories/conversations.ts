import { db } from "../database.js";
import {
  conversations,
  conversationMembers,
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