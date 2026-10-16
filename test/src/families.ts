/*
  Shared pieces of the three-family suites: fixture publishing, memoized scenarios and the
  partition helpers. Each suite file gets its own project set, so the defaults run appears
  once per file; the backend deduplicates the repeated work.
*/

import { SHORT_CDR3, THREE_FAMILIES } from "./fixtures";
import type { Run } from "./helpers";
import { vdjDataset } from "@platforma-sdk/test";
import type { Suite } from "./suite";

export const clusterOf = (m: Map<string, string>, key: string) => {
  const c = m.get(key);
  if (c === undefined) throw new Error(`${key} has no cluster`);
  return c;
};

/** True when every cluster of `finer` sits inside one cluster of `coarser`. */
export function refines(finer: string[][], coarser: string[][]): boolean {
  return finer.every((f) => coarser.some((c) => f.every((m) => c.includes(m))));
}

export const families = (suite: Suite) =>
  suite.dataset("Three families", vdjDataset(THREE_FAMILIES));
export const scenario = (suite: Suite, key: string, patch: Record<string, unknown>): Promise<Run> =>
  suite.run(key, families(suite), { ...SHORT_CDR3, ...patch });
export const defaults = (suite: Suite) => scenario(suite, "defaults", {});
