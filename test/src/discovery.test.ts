/*
  Discovery through the model: the seeded dataset shows up in `datasetOptions`, its CDR3
  column in `sequenceOptions`, and a run resolves the clusters table. The behavioural
  assertions over the exported columns live in the other suites.
*/

import { describe } from "vitest";
import { ClonotypeClusteringBlockPointer } from "this-block";
import { THREE_FAMILIES } from "./fixtures";
import type { DatasetOption, SequenceOption } from "./helpers";
import {
  VDJ_CDR3_ID,
  addBlock,
  awaitBlockDone,
  patchBlockData,
  stableOutput,
  vdjDataset,
} from "@platforma-sdk/test";
import { publishDataset } from "./helpers";
import { suiteTest } from "./suite";

describe("discovery of an xsv-import seeded dataset", () => {
  suiteTest(
    "dataset and sequence options resolve, and the run yields a clusters table",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const ctx = await suite.project("discovery");
      const { rawPrj } = ctx;
      await publishDataset(ctx, "Three families", vdjDataset(THREE_FAMILIES));

      const clusteringId = await addBlock(rawPrj, "Clustering", ClonotypeClusteringBlockPointer);

      const datasets = await stableOutput<DatasetOption[]>(
        rawPrj,
        clusteringId,
        "datasetOptions",
        180000,
      );
      expect(datasets).toHaveLength(1);
      await patchBlockData(rawPrj, clusteringId, { datasetRef: datasets[0].primary.ref });

      const sequences = await stableOutput<SequenceOption[]>(
        rawPrj,
        clusteringId,
        "sequenceOptions",
        180000,
      );
      expect(sequences.map((s) => s.label)).toEqual(["CDR3 aa"]);
      // The id the other suites wire directly is exactly what the model derives.
      expect(sequences[0].value).toBe(VDJ_CDR3_ID);
      await patchBlockData(rawPrj, clusteringId, {
        sequencesRef: [sequences[0].value],
        cpu: 2,
        mem: 4,
      });

      expect(await stableOutput<boolean>(rawPrj, clusteringId, "isPeptide", 180000)).toBe(false);

      await rawPrj.runBlock(clusteringId);
      await awaitBlockDone(rawPrj, clusteringId, 540000);

      const table = await stableOutput<{ fullTableHandle?: string }>(
        rawPrj,
        clusteringId,
        "clustersTable",
        180000,
      );
      expect(table.fullTableHandle).toBeDefined();
    },
  );
});
