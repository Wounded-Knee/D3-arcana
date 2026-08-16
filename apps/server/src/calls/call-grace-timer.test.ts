import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetEmptyRoomGraceForTests, scheduleEmptyRoomGrace } from "./call-grace-timer.js";
import {
  createCall,
  getActiveCallForConversation,
  markParticipantLeft,
  upsertParticipantJoined,
} from "../repositories/calls.js";
import { createUser } from "../repositories/users.js";
import { createConversation } from "../repositories/conversations.js";
import { setMediaSessionProviderForTests } from "../media/media-provider-instance.js";
import { MockMediaSessionProvider } from "../media/mock-media-provider.js";

describe("call grace timer", () => {
  beforeEach(() => {
    process.env.CALL_EMPTY_GRACE_MS = "25";
    setMediaSessionProviderForTests(new MockMediaSessionProvider());
  });

  afterEach(() => {
    resetEmptyRoomGraceForTests();
    delete process.env.CALL_EMPTY_GRACE_MS;
  });

  it("ends an empty call after the grace period", async () => {
    const provider = new MockMediaSessionProvider();
    setMediaSessionProviderForTests(provider);

    const user = await createUser("Alice");
    const conversation = await createConversation("Grace", user.id);
    const call = await createCall(conversation.id, user.id, "audio");

    await upsertParticipantJoined(
      call.id,
      conversation.id,
      user.id,
      "publisher",
    );

    await markParticipantLeft(call.id, conversation.id, user.id);
    scheduleEmptyRoomGrace(call.id);

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    const active = await getActiveCallForConversation(conversation.id);
    expect(active).toBeNull();
    expect(provider.endRoomCalls).toContain(call.id);
  });
});
