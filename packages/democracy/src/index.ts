export const SIMPLE_MAJORITY_KEY = "simple_majority";

export type DemocracyTally = {
  for: number;
  against: number;
  abstentions: number;
};

export type DemocracyThresholds = {
  minFor?: number;
  minAgainst?: number;
  minAbstentions?: number;
};

export type DemocracyDecision =
  | { status: "undecided" }
  | { status: "ratified" }
  | { status: "rejected" };

export interface DemocracyModel {
  readonly key: string;
  evaluate(
    tally: DemocracyTally,
    thresholds?: DemocracyThresholds,
  ): DemocracyDecision;
}

export function abstentions(
  totalUserCount: number,
  forCount: number,
  againstCount: number,
): number {
  return totalUserCount - (forCount + againstCount);
}

export function tallyFromCounts(
  totalUserCount: number,
  forCount: number,
  againstCount: number,
): DemocracyTally {
  return {
    for: forCount,
    against: againstCount,
    abstentions: abstentions(totalUserCount, forCount, againstCount),
  };
}

export type DemocracyRegistry = {
  register(model: DemocracyModel): void;
  get(key: string): DemocracyModel | undefined;
  list(): DemocracyModel[];
  clear(): void;
};

export function createDemocracyRegistry(): DemocracyRegistry {
  const models = new Map<string, DemocracyModel>();

  return {
    register(model) {
      models.set(model.key, model);
    },
    get(key) {
      return models.get(key);
    },
    list() {
      return [...models.values()];
    },
    clear() {
      models.clear();
    },
  };
}
