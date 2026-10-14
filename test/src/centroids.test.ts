/*
  Centroid outputs end to end. consensus-parity.test.ts pins the TS oracle to the Python;
  these pin what the block actually exports: the Tengo threads the thresholds through, the
  Python emits the columns, and the values match the documented rules (docs/outputs.md).
*/

import { describe } from "vitest";
import { THREE_FAMILIES } from "./fixtures";
import { hasXsvImport, sequencesByCluster } from "./helpers";
import { suiteTest } from "./suite";
import { clusterOf, defaults, scenario } from "./families";

describe.skipIf(!hasXsvImport)("three families", () => {
  describe("centroids", () => {
    suiteTest.concurrent(
      "defaults: consensus at 0.6, reference centroid is a member, distances bounded",
      { timeout: 600000 },
      async ({ suite, expect }) => {
        const run = await defaults(suite);
        const membership = await run.membership();
        const members = sequencesByCluster(THREE_FAMILIES, membership);

        // Reference centroid (medoid) is always a real observed member of its cluster.
        const reference = await run.centroids("referenceCentroid");
        expect(reference.size).toBe(3);
        for (const [cluster, seq] of reference) {
          expect(members.get(cluster), `reference centroid of ${cluster}`).toContain(seq);
        }

        // Computed centroid: per-column majority at threshold 0.6, equal weight per member.
        // Family A: W (2/3) at position 6, T (2/3) at position 10. Family B: L (2/3), Y (2/3).
        // Family C: its 1:1 column stays X.
        const computed = await run.centroids("centroid");
        expect(computed.get(clusterOf(membership, "c01"))).toBe("CARDYWGQGTLV");
        expect(computed.get(clusterOf(membership, "c04"))).toBe("CASSLGTEAYF");
        expect(computed.get(clusterOf(membership, "c07"))).toBe("CTRGGXWFDP");

        // distanceToCentroid in [0, 1] for every member; clusterRadius is the max over members.
        const distance = await run.readMap({
          name: "pl7.app/distanceToCentroid",
          axes: ["pl7.app/vdj/clonotypeKey"],
        });
        expect(distance.size).toBe(THREE_FAMILIES.length);
        for (const [key, d] of distance) {
          expect(d, `distance of ${key}`).toBeGreaterThanOrEqual(0);
          expect(d, `distance of ${key}`).toBeLessThanOrEqual(1);
        }
        const radius = await run.readMap({
          name: "pl7.app/clustering/clusterRadius",
          axes: ["pl7.app/clusterId"],
        });
        for (const [cluster, r] of radius) {
          const own = [...membership]
            .filter(([, c]) => c === cluster)
            .map(([k]) => Number(distance.get(k)));
          expect(r, `radius of ${cluster}`).toBeCloseTo(Math.max(...own), 6);
        }
      },
    );

    suiteTest.concurrent(
      "consensus threshold 1.0 marks every disputed column with X",
      { timeout: 600000 },
      async ({ suite, expect }) => {
        const run = await scenario(suite, "threshold 1", { consensusThreshold: 1 });
        const membership = await run.membership();
        const computed = await run.centroids("centroid");
        expect(computed.get(clusterOf(membership, "c01"))).toBe("CARDYXGQGXLV");
        expect(computed.get(clusterOf(membership, "c04"))).toBe("CASSXGTEAXF");
        expect(computed.get(clusterOf(membership, "c07"))).toBe("CTRGGXWFDP");

        // The reference centroid does not depend on the threshold and stays a real member.
        const reference = await run.centroids("referenceCentroid");
        const members = sequencesByCluster(THREE_FAMILIES, membership);
        for (const [cluster, seq] of reference) expect(members.get(cluster)).toContain(seq);
      },
    );

    suiteTest.concurrent(
      "abundance weighting lets one expanded clone outvote two members",
      { timeout: 600000 },
      async ({ suite, expect }) => {
        const run = await scenario(suite, "weighted", { weightByAbundance: true });
        const membership = await run.membership();
        const computed = await run.centroids("centroid");
        // Family B, position 10: F carries 200 of 290 cells though only 1 of 3 members.
        expect(computed.get(clusterOf(membership, "c04"))).toBe("CASSLGTEAFF");
        // Family A is unanimous enough under both weightings.
        expect(computed.get(clusterOf(membership, "c01"))).toBe("CARDYWGQGTLV");
        // Family C, position 6: N (30 cells) against Y (10 cells) is 0.75, so no X any more.
        expect(computed.get(clusterOf(membership, "c07"))).toBe("CTRGGNWFDP");
      },
    );
  });
});
