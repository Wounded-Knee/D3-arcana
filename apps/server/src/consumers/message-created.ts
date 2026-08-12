import type { MessageCreatedEvent } from "@d3-arcana/events";

import {
  hasProcessedEvent,
  markEventProcessed,
} from "../events/consumer-deduplication.js";

const CONSUMER_NAME = "message-created-test-consumer";

export async function handleMessageCreated(
  event: MessageCreatedEvent,
): Promise<void> {
  if (await hasProcessedEvent(CONSUMER_NAME, event.eventId)) {
    console.log(
      `[consumer] already processed ${event.eventId}; skipping`,
    );

    return;
  }

  console.log(
    `[consumer] message.created: ${event.payload.messageId}`,
  );

  console.log(
    `[consumer] content: ${event.payload.content}`,
  );

  await markEventProcessed(
    CONSUMER_NAME,
    event.eventId,
  );
}