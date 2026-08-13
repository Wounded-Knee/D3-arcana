import { describe, expect, it } from "vitest";

import {
  hasProcessedEvent,
  markEventProcessed,
} from "./consumer-deduplication.js";

describe("consumer deduplication", () => {
  it("tracks processed events per consumer", async () => {
    const eventId = "11111111-1111-4111-8111-111111111111";

    expect(
      await hasProcessedEvent("test-consumer", eventId),
    ).toBe(false);

    await markEventProcessed("test-consumer", eventId);

    expect(
      await hasProcessedEvent("test-consumer", eventId),
    ).toBe(true);
    expect(
      await hasProcessedEvent("other-consumer", eventId),
    ).toBe(false);
  });

  it("is idempotent when marking the same event twice", async () => {
    const eventId = "22222222-2222-4222-8222-222222222222";

    await markEventProcessed("test-consumer", eventId);
    await markEventProcessed("test-consumer", eventId);

    expect(
      await hasProcessedEvent("test-consumer", eventId),
    ).toBe(true);
  });
});
