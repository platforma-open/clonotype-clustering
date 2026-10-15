/*
  Subset filter: a `pl7.app/isSubset` column on the clonotype axis restricts clustering to
  the clonotypes it marks. Everything the block exports must then be about those rows only.
*/

import { describe } from "vitest";
import { SHORT_CDR3, THREE_FAMILIES } from "./fixtures";
import { vdjDataset } from "@platforma-sdk/test";
import { suiteTest } from "./suite";

describe("subset filter", () => {
  suiteTest.concurrent(
    "only the marked clonotypes are clustered",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const picked = ["c01", "c02", "c04", "c07"];
      const dataset = suite.dataset(
        "Picked subset",
        vdjDataset(THREE_FAMILIES, { subset: { members: picked, label: "Picked" } }),
      );
      const run = await suite.run("filtered", dataset, SHORT_CDR3);

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
