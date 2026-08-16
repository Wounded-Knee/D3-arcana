import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createTestServer } from "../test/helpers/app.js";

describe("egress ingest websocket", () => {
  let testServer: Awaited<ReturnType<typeof createTestServer>> | undefined;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = undefined;
    }
  });

  it("rejects a bad secret", async () => {
    testServer = await createTestServer();
    const socket = new WebSocket(
      `ws://127.0.0.1:${testServer.port}/internal/egress?secret=nope&recordingId=00000000-0000-4000-8000-000000000001&callId=00000000-0000-4000-8000-000000000002&trackSid=TR_x`,
    );

    const code = await new Promise<number>((resolve) => {
      socket.on("close", (closeCode) => resolve(closeCode));
    });
    expect(code).toBe(4401);
  });
});
