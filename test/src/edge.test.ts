/*
  Degenerate inputs the block must survive: one clonotype, and duplicated sequences.
*/

import { describe } from "vitest";
import { SHORT_CDR3 } from "./fixtures";
import { vdjDataset } from "@platforma-sdk/test";
import { suiteTest } from "./suite";

describe("degenerate inputs", () => {
  suiteTest.concurrent(
    "a single clonotype is its own cluster with zero distance",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const dataset = suite.dataset(
        "One clonotype",
        vdjDataset([{ key: "only", seq: "CARDYWGQGTLV", count: 7 }]),
      );
      const run = await suite.run("single", dataset, SHORT_CDR3);
      expect(await run.clusters()).toEqual([["only"]]);
      expect([...(await run.centroids("centroid")).values()]).toEqual(["CARDYWGQGTLV"]);
      expect([...(await run.centroids("referenceCentroid")).values()]).toEqual(["CARDYWGQGTLV"]);
      const distance = await run.readMap({
        name: "pl7.app/distanceToCentroid",
        axes: ["pl7.app/vdj/clonotypeKey"],
      });
      expect([...distance.values()]).toEqual([0]);
      const radius = await run.readMap({
        name: "pl7.app/clustering/clusterRadius",
        axes: ["pl7.app/clusterId"],
      });
      expect([...radius.values()]).toEqual([0]);
    },
  );

  suiteTest.concurrent(
    "identical sequences under different keys share one cluster and a zero radius",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const rows = [
        { key: "a", seq: "CASSLGTEAFF", count: 5 },
        { key: "b", seq: "CASSLGTEAFF", count: 3 },
        { key: "c", seq: "CASSLGTEAFF", count: 1 },
      ];
      const dataset = suite.dataset("Identical sequences", vdjDataset(rows));
      const run = await suite.run("identical", dataset, SHORT_CDR3);
      expect(await run.clusters()).toEqual([["a", "b", "c"]]);
      expect([...(await run.centroids("centroid")).values()]).toEqual(["CASSLGTEAFF"]);
      const size = await run.readMap({
        name: "pl7.app/clustering/clusterSize",
        axes: ["pl7.app/clusterId"],
      });
      expect([...size.values()]).toEqual([3]);
      const radius = await run.readMap({
        name: "pl7.app/clustering/clusterRadius",
        axes: ["pl7.app/clusterId"],
      });
      expect([...radius.values()]).toEqual([0]);
    },
  );
});
