import {
  createDemocracyRegistry,
  SIMPLE_MAJORITY_KEY,
} from "@d3-arcana/democracy";

export { SIMPLE_MAJORITY_KEY };

export const democracyRegistry = createDemocracyRegistry();

export function resetDemocracyRegistryForTests(): void {
  democracyRegistry.clear();
}
