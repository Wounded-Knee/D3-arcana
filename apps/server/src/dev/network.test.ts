import { describe, expect, it } from "vitest";

import { pickPreferredLanAddress } from "./network.js";

describe("pickPreferredLanAddress", () => {
  it("prefers a physical 192.168 address over docker bridges", () => {
    expect(
      pickPreferredLanAddress([
        { name: "docker0", address: "172.17.0.1" },
        { name: "br-2cc5c322f52c", address: "172.18.0.1" },
        { name: "wlp0s20f3", address: "192.168.1.50" },
      ]),
    ).toBe("192.168.1.50");
  });

  it("prefers 10.x on a physical NIC when no 192.168 exists", () => {
    expect(
      pickPreferredLanAddress([
        { name: "docker0", address: "172.17.0.1" },
        { name: "enp3s0", address: "10.0.0.12" },
      ]),
    ).toBe("10.0.0.12");
  });

  it("falls back to a virtual address when that is all that exists", () => {
    expect(
      pickPreferredLanAddress([{ name: "docker0", address: "172.17.0.1" }]),
    ).toBe("172.17.0.1");
  });

  it("returns undefined for an empty list", () => {
    expect(pickPreferredLanAddress([])).toBeUndefined();
  });
});
