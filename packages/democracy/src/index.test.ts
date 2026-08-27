import { describe, expect, it } from "vitest";

import {
  abstentions,
  createDemocracyRegistry,
  SIMPLE_MAJORITY_KEY,
  tallyFromCounts,
  type DemocracyModel,
} from "./index.js";

describe("abstentions", () => {
  it("is totalUserCount minus for and against", () => {
    expect(abstentions(3, 1, 0)).toBe(2);
    expect(abstentions(5, 2, 2)).toBe(1);
    expect(abstentions(1, 0, 0)).toBe(1);
  });
});

describe("tallyFromCounts", () => {
  it("derives abstentions from the same formula", () => {
    expect(tallyFromCounts(3, 1, 0)).toEqual({
      for: 1,
      against: 0,
      abstentions: 2,
    });
  });
});

describe("createDemocracyRegistry", () => {
  it("registers, gets, lists, and clears models", () => {
    const registry = createDemocracyRegistry();
    const model: DemocracyModel = {
      key: SIMPLE_MAJORITY_KEY,
      evaluate: () => ({ status: "undecided" }),
    };

    expect(registry.get(SIMPLE_MAJORITY_KEY)).toBeUndefined();
    expect(registry.list()).toEqual([]);

    registry.register(model);
    expect(registry.get(SIMPLE_MAJORITY_KEY)).toBe(model);
    expect(registry.list()).toEqual([model]);

    registry.clear();
    expect(registry.get(SIMPLE_MAJORITY_KEY)).toBeUndefined();
    expect(registry.list()).toEqual([]);
  });
});
