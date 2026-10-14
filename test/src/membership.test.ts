/*
  Cluster assignment: the contract every downstream consumer relies on. Each test publishes
  a synthetic dataset, runs the real pipeline (mmseqs2, kalign, process_results.py) and
  asserts on the exported columns.

  Not covered: identity 1.0. mmseqs2 1.19.0 (macOS arm64) segfaults in kmermatcher with
  `--min-seq-id 1`, which the UI slider allows. Pin that behaviour once the block clamps the
  value or the software package is fixed.
*/

import { blockTest } from "@platforma-sdk/test";
import { describe } from "vitest";
import { SHORT_CDR3, THREE_FAMILIES, THREE_FAMILY_PARTITION } from "./fixtures";
import { clusterRows, hasXsvImport } from "./helpers";

describe.skipIf(!hasXsvImport)("cluster membership", () => {
  blockTest(
    "three families cluster as three groups at identity 0.8",
    { timeout: 600000 },
    async ({ rawPrj, ml, helpers, tmpFolder, expect }) => {
      const run = await clusterRows({ rawPrj, ml, helpers, tmpFolder }, THREE_FAMILIES, SHORT_CDR3);

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

  blockTest(
    "an identity above the closest pair keeps every sequence in its own cluster",
    { timeout: 600000 },
    async ({ rawPrj, ml, helpers, tmpFolder, expect }) => {
      // The closest pair differs at 1 of 12 residues (0.917); 0.99 separates everything
      // while staying below 1, which crashes mmseqs2 (see the note above).
      const run = await clusterRows({ rawPrj, ml, helpers, tmpFolder }, THREE_FAMILIES, {
        ...SHORT_CDR3,
        identity: 0.99,
      });
      expect(await run.clusters()).toEqual(THREE_FAMILIES.map((r) => [r.key]));
    },
  );

  blockTest(
    "the default precision splits short-sequence families that high precision joins",
    { timeout: 600000 },
    async ({ rawPrj, ml, helpers, tmpFolder, expect }) => {
      const run = await clusterRows({ rawPrj, ml, helpers, tmpFolder }, THREE_FAMILIES);
      const clusters = await run.clusters();
      // Every cluster is still inside one family: the defaults are less sensitive, never wrong.
      for (const members of clusters) {
        const family = THREE_FAMILY_PARTITION.find((f) => f.includes(members[0]));
        expect(family).toEqual(expect.arrayContaining(members));
      }
      expect(clusters.length).toBeGreaterThan(THREE_FAMILY_PARTITION.length);
    },
  );

  blockTest(
    "input row order does not change the partition",
    { timeout: 600000 },
    async ({ rawPrj, ml, helpers, tmpFolder, expect }) => {
      const run = await clusterRows(
        { rawPrj, ml, helpers, tmpFolder },
        [...THREE_FAMILIES].reverse(),
        SHORT_CDR3,
      );
      expect(await run.clusters()).toEqual(THREE_FAMILY_PARTITION);
    },
  );
});
