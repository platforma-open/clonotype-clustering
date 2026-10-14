/*
  Discovery through the model: the seeded dataset shows up in `datasetOptions`, its CDR3
  column in `sequenceOptions`, and a run resolves the clusters table. The behavioural
  assertions over the exported columns live in membership.test.ts and centroids.test.ts.
*/

import { blockTest } from "@platforma-sdk/test";
import { describe } from "vitest";
import { ClonotypeClusteringBlockPointer } from "this-block";
import { THREE_FAMILIES } from "./fixtures";
import type { DatasetOption, SequenceOption } from "./helpers";
import { hasXsvImport, patchBlockData, publishTsv, stableOutput, vdjSpec, vdjTsv } from "./helpers";

describe.skipIf(!hasXsvImport)("discovery of an xsv-import seeded dataset", () => {
  blockTest(
    "dataset and sequence options resolve, and the run yields a clusters table",
    { timeout: 600000 },
    async ({ rawPrj, ml, helpers, tmpFolder, expect }) => {
      const ctx = { rawPrj, ml, helpers, tmpFolder };
      await publishTsv(ctx, "Fixture dataset", vdjTsv(THREE_FAMILIES), vdjSpec());

      const clusteringId = await rawPrj.addBlock("Clustering", ClonotypeClusteringBlockPointer);

      const datasets = await stableOutput<DatasetOption[]>(
        rawPrj,
        clusteringId,
        "datasetOptions",
        60000,
      );
      expect(datasets).toHaveLength(1);
      await patchBlockData(rawPrj, clusteringId, { datasetRef: datasets[0].primary.ref });

      const sequences = await stableOutput<SequenceOption[]>(
        rawPrj,
        clusteringId,
        "sequenceOptions",
        60000,
      );
      expect(sequences.map((s) => s.label)).toEqual(["CDR3 aa"]);
      await patchBlockData(rawPrj, clusteringId, { sequencesRef: [sequences[0].value] });

      expect(await stableOutput<boolean>(rawPrj, clusteringId, "isPeptide", 180000)).toBe(false);

      await rawPrj.runBlock(clusteringId);
      await helpers.awaitBlockDone(clusteringId, 540000);

      const table = await stableOutput<{ fullTableHandle?: string }>(
        rawPrj,
        clusteringId,
        "clustersTable",
        60000,
      );
      expect(table.fullTableHandle).toBeDefined();
    },
  );
});
