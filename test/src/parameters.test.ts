/*
  Clustering parameters. Exact partitions at every setting would pin mmseqs2 internals; the
  assertions are the block's own promises: identity orders partitions, and no cluster
  crosses a family.
*/

import { describe } from "vitest";
import { THREE_FAMILIES, THREE_FAMILY_PARTITION } from "./fixtures";
import { hasXsvImport } from "./helpers";
import { suiteTest } from "./suite";
import { refines, scenario } from "./families";

describe.skipIf(!hasXsvImport)("three families", () => {
  describe("parameters", () => {
    // Exact partitions at every setting would pin mmseqs2 internals; the assertions are
    // the block's own promises: identity orders partitions, and no cluster crosses a family.
    suiteTest.concurrent(
      "a higher identity only ever refines the partition",
      { timeout: 600000 },
      async ({ suite, expect }) => {
        const byIdentity = await Promise.all(
          [0.6, 0.9, 0.99].map((identity) =>
            scenario(suite, `identity ${identity}`, { identity }).then((r) => r.clusters()),
          ),
        );
        for (const clusters of byIdentity)
          expect(refines(clusters, THREE_FAMILY_PARTITION)).toBe(true);
        for (let i = 1; i < byIdentity.length; i++) {
          expect(refines(byIdentity[i], byIdentity[i - 1]), `step ${i} refines step ${i - 1}`).toBe(
            true,
          );
        }
        expect(byIdentity[byIdentity.length - 1]).toEqual(THREE_FAMILIES.map((r) => [r.key]));
      },
    );

    suiteTest.concurrent(
      "easy-linclust never merges across families",
      { timeout: 600000 },
      async ({ suite, expect }) => {
        // linclust is the faster, less sensitive tool: it may split a family, never join two.
        const run = await scenario(suite, "linclust", { clusteringTool: "easy-linclust" });
        expect(refines(await run.clusters(), THREE_FAMILY_PARTITION)).toBe(true);
      },
    );
  });
});
