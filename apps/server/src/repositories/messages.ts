import { db } from "../database.js";
import { messages, outboxEvents } from "../db/schema.js";

export async function createMessage(
  conversationId: string,
  senderId: string,
  content: string,
) {
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderId,
        content,
      })
      .returning();

    await tx.insert(outboxEvents).values({
      type: "message.created",
      aggregateType: "message",
      aggregateId: message.id,
      conversationId,
      actorId: senderId,
      payload: {
        messageId: message.id,
        content: message.content,
      },
    });

    return message;
  });
}