/*
  Clustering parameters. Exact partitions at every setting would pin mmseqs2 internals; the
  assertions here are the block's own promises: the identity threshold orders partitions
  (higher identity never merges clusters), and both tools agree on well-separated families.
*/

import { blockTest } from "@platforma-sdk/test";
import { describe } from "vitest";
import { SHORT_CDR3, THREE_FAMILIES, THREE_FAMILY_PARTITION } from "./fixtures";
import { clusterRows, hasXsvImport } from "./helpers";

/** True when every cluster of `finer` sits inside one cluster of `coarser`. */
function refines(finer: string[][], coarser: string[][]): boolean {
  return finer.every((f) => coarser.some((c) => f.every((m) => c.includes(m))));
}

describe.skipIf(!hasXsvImport)("clustering parameters", () => {
  const grid = [
    { identity: 0.6, clusteringTool: "easy-cluster" },
    { identity: 0.9, clusteringTool: "easy-cluster" },
    { identity: 0.99, clusteringTool: "easy-cluster" },
  ] as const;

  const partitions: Record<string, string[][]> = {};

  for (const cell of grid) {
    blockTest(
      `identity ${cell.identity} with ${cell.clusteringTool}`,
      { timeout: 600000 },
      async ({ rawPrj, ml, helpers, tmpFolder, expect }) => {
        const run = await clusterRows({ rawPrj, ml, helpers, tmpFolder }, THREE_FAMILIES, {
          ...SHORT_CDR3,
          ...cell,
        });
        const clusters = await run.clusters();
        partitions[JSON.stringify(cell)] = clusters;
        // No cluster ever crosses a family: the families are too far apart at any identity.
        for (const members of clusters) {
          const family = THREE_FAMILY_PARTITION.find((f) => f.includes(members[0]));
          expect(family).toEqual(expect.arrayContaining(members));
        }
      },
    );
  }

  blockTest(
    "a higher identity only ever refines the partition",
    { timeout: 600000 },
    async ({ expect }) => {
      // Runs in file order after the grid above; vitest executes blockTests sequentially per file.
      const byIdentity = grid.map((cell) => partitions[JSON.stringify(cell)]);
      expect(byIdentity.every((p) => p !== undefined)).toBe(true);
      for (let i = 1; i < byIdentity.length; i++) {
        expect(
          refines(byIdentity[i], byIdentity[i - 1]),
          `identity ${grid[i].identity} refines ${grid[i - 1].identity}`,
        ).toBe(true);
      }
      expect(byIdentity[byIdentity.length - 1]).toEqual(THREE_FAMILIES.map((r) => [r.key]));
    },
  );

  blockTest(
    "easy-linclust never merges across families",
    { timeout: 600000 },
    async ({ rawPrj, ml, helpers, tmpFolder, expect }) => {
      // linclust is the faster, less sensitive tool: it may split a family, never join two.
      const run = await clusterRows({ rawPrj, ml, helpers, tmpFolder }, THREE_FAMILIES, {
        ...SHORT_CDR3,
        clusteringTool: "easy-linclust",
      });
      expect(refines(await run.clusters(), THREE_FAMILY_PARTITION)).toBe(true);
    },
  );
});
