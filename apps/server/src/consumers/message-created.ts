import type { MessageCreatedEvent } from "@d3-arcana/events";

export async function handleMessageCreated(
  event: MessageCreatedEvent,
): Promise<void> {
  console.log(
    `[consumer] message.created: ${event.payload.messageId}`,
  );

  console.log(
    `[consumer] content: ${event.payload.content}`,
  );
}