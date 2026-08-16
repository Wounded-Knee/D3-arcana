import { describe, expect, it } from "vitest";

import {
  CallSilenceWatch,
  isSilentPcm,
  pcmRms,
} from "./pcm-silence.js";

describe("pcm silence", () => {
  it("treats near-zero PCM as silent and loud PCM as speech", () => {
    const quiet = Buffer.alloc(200);
    const loud = Buffer.alloc(200);
    loud.writeInt16LE(4000, 0);
    loud.writeInt16LE(-4000, 2);

    expect(pcmRms(quiet)).toBe(0);
    expect(isSilentPcm(quiet)).toBe(true);
    expect(isSilentPcm(loud)).toBe(false);
  });

  it("emits only after every active track is quiet for the hold", () => {
    const watch = new CallSilenceWatch();
    watch.update("a", { silent: true }, 0);
    watch.update("b", { silent: false }, 0);
    expect(watch.shouldJoinLive(700)).toBe(false);

    watch.update("b", { silent: true }, 100);
    expect(watch.shouldJoinLive(500)).toBe(false);
    expect(watch.shouldJoinLive(800)).toBe(true);
    expect(watch.shouldJoinLive(900)).toBe(false);
  });

  it("blocks the jump while one track is still loud", () => {
    const watch = new CallSilenceWatch();
    watch.update("a", { silent: true }, 0);
    watch.update("b", { silent: false }, 0);
    expect(watch.shouldJoinLive(1000)).toBe(false);
  });
});
