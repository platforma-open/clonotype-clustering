/*
  Subset filter: a `pl7.app/isSubset` column on the clonotype axis restricts clustering to
  the clonotypes it marks. Everything the block exports must then be about those rows only.
*/

import { blockTest } from "@platforma-sdk/test";
import { describe } from "vitest";
import { SHORT_CDR3, THREE_FAMILIES } from "./fixtures";
import {
  hasXsvImport,
  publishTsv,
  runClustering,
  vdjSpecWithSubset,
  vdjTsvWithSubset,
} from "./helpers";

describe.skipIf(!hasXsvImport)("subset filter", () => {
  blockTest(
    "only the marked clonotypes are clustered",
    { timeout: 600000 },
    async ({ rawPrj, ml, helpers, tmpFolder, expect }) => {
      const ctx = { rawPrj, ml, helpers, tmpFolder };
      const picked = ["c01", "c02", "c04", "c07"];
      await publishTsv(
        ctx,
        "Fixture dataset",
        vdjTsvWithSubset(THREE_FAMILIES, picked),
        vdjSpecWithSubset("Picked"),
      );
      const run = await runClustering(ctx, SHORT_CDR3, { filterName: "tag" });

      const membership = await run.membership();
      expect([...membership.keys()].sort()).toEqual(picked);
      expect(await run.clusters()).toEqual([["c01", "c02"], ["c04"], ["c07"]]);

      const distance = await run.readMap({
        name: "pl7.app/distanceToCentroid",
        axes: ["pl7.app/vdj/clonotypeKey"],
      });
      expect([...distance.keys()].sort()).toEqual(picked);
    },
  );
});
