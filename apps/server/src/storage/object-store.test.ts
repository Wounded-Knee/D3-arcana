import { describe, expect, it } from "vitest";

import { objectKeyForTrack } from "./config.js";
import { InMemoryObjectStore } from "./memory-store.js";

describe("object store keys and in-memory adapter", () => {
  it("builds a per-track object key including the recording id", () => {
    expect(
      objectKeyForTrack(
        "conv-1",
        "call-1",
        "user-1",
        "TR_abc",
        "rec-1",
      ),
    ).toBe(
      "conversations/conv-1/calls/call-1/participants/user-1/TR_abc/rec-1",
    );
  });

  it("builds a fragment key from the session prefix", () => {
    const store = new InMemoryObjectStore();
    expect(store.objectKeyForFragment("conversations/a/calls/b/session", 1500)).toBe(
      "conversations/a/calls/b/session/1500.wav",
    );
  });

  it("issues a fake read URL for tests", async () => {
    const store = new InMemoryObjectStore();
    const url = await store.issueReadUrl("conversations/a/calls/b/file.wav", 90);

    expect(url).toContain("conversations%2Fa%2Fcalls%2Fb%2Ffile.wav");
    expect(url).toContain("exp=90");
    expect(store.issuedUrls).toEqual([
      { key: "conversations/a/calls/b/file.wav", expiresInSeconds: 90 },
    ]);
  });

  it("stores put objects in memory", async () => {
    const store = new InMemoryObjectStore();
    const body = Buffer.from("wav");
    await store.put("clip.wav", body, "audio/wav");
    expect(store.puts).toEqual([
      { key: "clip.wav", body, contentType: "audio/wav" },
    ]);
  });
});
