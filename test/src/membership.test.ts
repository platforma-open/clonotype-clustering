/*
  Cluster assignment: the contract every downstream consumer relies on. Scenarios are
  clustering blocks over the published three-family dataset, in their own projects.

  Not covered: identity 1.0. mmseqs2 1.19.0 (macOS arm64) segfaults in kmermatcher with
  `--min-seq-id 1`, which the UI slider allows. Pin that behaviour once the block clamps the
  value or the software package is fixed.
*/

import { describe } from "vitest";
import { SHORT_CDR3, THREE_FAMILIES, THREE_FAMILY_PARTITION } from "./fixtures";
import { hasXsvImport, vdjSpec, vdjTsv } from "./helpers";
import { suiteTest } from "./suite";
import { defaults, families, refines, scenario } from "./families";

describe.skipIf(!hasXsvImport)("three families", () => {
  describe("cluster membership", () => {
    suiteTest.concurrent(
      "three families cluster as three groups at identity 0.8",
      { timeout: 600000 },
      async ({ suite, expect }) => {
        const run = await defaults(suite);
        expect(await run.clusters()).toEqual(THREE_FAMILY_PARTITION);

        // Every cluster id is the key of one of its own members: the representative. The
        // display label on the clonotype axis is that id with a "CL-" prefix.
        const membership = await run.membership();
        const labels = await run.clusterLabels();
        for (const [key, cluster] of membership) {
          expect(membership.get(cluster), `cluster ${cluster} of ${key}`).toBe(cluster);
          expect(labels.get(key)).toBe(`CL-${cluster}`);
        }

        const size = await run.readMap({
          name: "pl7.app/clustering/clusterSize",
          axes: ["pl7.app/clusterId"],
        });
        expect([...size.values()].sort()).toEqual([2, 3, 3]);
      },
    );

    suiteTest.concurrent(
      "an identity above the closest pair keeps every sequence in its own cluster",
      { timeout: 600000 },
      async ({ suite, expect }) => {
        // The closest pair differs at 1 of 12 residues (0.917); 0.99 separates everything
        // while staying below 1, which crashes mmseqs2 (see the note above).
        const run = await scenario(suite, "identity 0.99", { identity: 0.99 });
        expect(await run.clusters()).toEqual(THREE_FAMILIES.map((r) => [r.key]));
      },
    );

    suiteTest.concurrent(
      "the default precision splits short-sequence families that high precision joins",
      { timeout: 600000 },
      async ({ suite, expect }) => {
        const run = await suite.run("default precision", families(suite), {});
        const clusters = await run.clusters();
        // Every cluster is still inside one family: the defaults are less sensitive, never wrong.
        expect(refines(clusters, THREE_FAMILY_PARTITION)).toBe(true);
        expect(clusters.length).toBeGreaterThan(THREE_FAMILY_PARTITION.length);
      },
    );

    suiteTest.concurrent(
      "input row order does not change the partition",
      { timeout: 600000 },
      async ({ suite, expect }) => {
        const reversed = suite.dataset(
          "Three families reversed",
          vdjTsv([...THREE_FAMILIES].reverse()),
          vdjSpec(),
        );
        const run = await suite.run("reversed", reversed, SHORT_CDR3);
        expect(await run.clusters()).toEqual(THREE_FAMILY_PARTITION);
      },
    );
  });
});
