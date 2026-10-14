/*
  End-to-end run of clonotype-clustering over a synthetic dataset.

  The dataset is published into the result pool by the xsv-import block, loaded
  straight from the sibling checkout (`dev-v2`), so no MiXCR run and no fastq
  fixtures are needed. The TSV in ../assets carries eight CDR3s in three obvious
  families; the block runs its real software (mmseqs2, kalign, the Python
  post-processing) against it.

  This covers the gaps consensus-parity.test.ts lists as needing integration
  fixtures: the model discovers the dataset and its sequence column, the
  workflow runs to Done and the clusters table output resolves.
*/

import {
  createPlDataTableStateV2,
  getStorageData,
  normalizeBlockStorage,
} from "@platforma-sdk/model";
import type { ML } from "@platforma-sdk/test";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import fs from "node:fs";
import path from "node:path";
import { ClonotypeClusteringBlockPointer } from "this-block";
import { describe } from "vitest";

const assets = path.resolve(import.meta.dirname, "../assets");
const xsvImportFolder = path.resolve(import.meta.dirname, "../../../xsv-import/block");
const hasXsvImport = fs.existsSync(path.join(xsvImportFolder, "block-pack", "manifest.json"));

const item = <T>(payload: T) => ({
  id: crypto.randomUUID(),
  disabled: false,
  expanded: false,
  payload,
});

// The clonotype axis, shared by both fixture tables so their columns join in the pool.
const clonotypeAxis = {
  name: "pl7.app/vdj/clonotypeKey",
  type: "String",
  domain: { "pl7.app/vdj/clonotypingRunId": "xsv-fixture" },
  annotations: { "pl7.app/label": "Clonotype key" },
};

// Bulk VDJ dataset in one table: the anchor abundance on [sampleId, clonotypeKey] and the
// CDR3 column keyed on the clonotype axis alone (`parentAxes`), as MiXCR publishes it. One
// block must publish both: a block's workflow sees only the blocks its args reference.
const datasetSpec = () => ({
  axes: [
    item({ column: "sampleId", spec: { name: "pl7.app/sampleId", type: "String" } }),
    item({ column: "clonotypeKey", spec: clonotypeAxis }),
  ],
  columns: [
    item({
      column: "cellCount",
      spec: {
        name: "pl7.app/vdj/uniqueCellCount",
        valueType: "Long",
        annotations: {
          "pl7.app/isAnchor": "true",
          "pl7.app/isAbundance": "true",
          "pl7.app/abundance/isPrimary": "true",
          "pl7.app/abundance/normalized": "false",
          "pl7.app/abundance/unit": "cells",
          "pl7.app/label": "Number of Cells",
        },
      },
    }),
    item({
      column: "cdr3aa",
      spec: {
        name: "pl7.app/vdj/sequence",
        valueType: "String",
        parentAxes: [1],
        domain: { "pl7.app/alphabet": "aminoacid", "pl7.app/vdj/feature": "CDR3" },
        annotations: { "pl7.app/label": "CDR3 aa" },
      },
    }),
    item({
      column: "label",
      spec: {
        name: "pl7.app/label",
        valueType: "String",
        parentAxes: [1],
        annotations: { "pl7.app/label": "Clonotype label" },
      },
    }),
  ],
  storageFormat: "Binary",
  partitionKeyLength: 1,
});

/**
 * Wait for Done while keeping the block state observed. A lazy-state block renders
 * its outputs only while something reads its state, and the `fileUploader` output
 * is what starts the local-file upload, so a wait on the overview alone never uploads.
 */
async function awaitBlockDoneObserved(rawPrj: ML.Project, blockId: string, timeoutMs: number) {
  const state = rawPrj.getBlockState(blockId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await state.getValue();
    const overview = (await rawPrj.overview.getValue())!.blocks.find((b) => b.id === blockId);
    if (overview === undefined) throw new Error(`Block not found: ${blockId}`);
    if (overview.outputErrors) {
      throw new Error(
        "Block error: " + (overview.outputsError ?? overview.exportsError ?? "no message"),
      );
    }
    if (overview.calculationStatus === "Done") return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Block ${blockId} did not reach Done within ${timeoutMs} ms`);
}

/** Merge a patch into a V3 block's persisted data. */
async function patchBlockData(rawPrj: ML.Project, blockId: string, patch: Record<string, unknown>) {
  const state = (await rawPrj.getBlockState(blockId).getValue()) as { blockStorage: unknown };
  const raw =
    typeof state.blockStorage === "string" ? JSON.parse(state.blockStorage) : state.blockStorage;
  const current = getStorageData<Record<string, unknown>>(normalizeBlockStorage(raw));
  await rawPrj.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: { ...current, ...patch },
  });
}

/** Publish a TSV into the result pool through an xsv-import block loaded from the sibling checkout. */
async function publishTsv(
  rawPrj: ML.Project,
  helpers: { getLocalFileHandle(p: string): Promise<unknown> },
  label: string,
  file: string,
  spec: unknown,
): Promise<string> {
  const blockId = await rawPrj.addBlock(label, { type: "dev-v2", folder: xsvImportFolder });
  const fileHandle = await helpers.getLocalFileHandle(path.join(assets, file));
  await rawPrj.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: { fileHandle, spec, tableState: createPlDataTableStateV2() },
  });
  await rawPrj.runBlock(blockId);
  await awaitBlockDoneObserved(rawPrj, blockId, 90000);
  return blockId;
}

async function stableOutput<T>(
  rawPrj: ML.Project,
  blockId: string,
  name: string,
  timeoutMs: number,
): Promise<T> {
  const state = await awaitStableState(rawPrj.getBlockState(blockId), timeoutMs);
  const output = (
    state.outputs as Record<string, { ok: boolean; value?: unknown; errors?: unknown }>
  )[name];
  if (!output?.ok) throw new Error(`Output ${name} is not ok: ${JSON.stringify(output?.errors)}`);
  return output.value as T;
}

describe.skipIf(!hasXsvImport)("clustering over an xsv-import seeded dataset", () => {
  blockTest(
    "discovers the dataset, runs, and resolves the clusters table",
    { timeout: 600000 },
    async ({ rawPrj, helpers, expect }) => {
      await publishTsv(rawPrj, helpers, "Fixture dataset", "clonotypes.tsv", datasetSpec());

      const clusteringId = await rawPrj.addBlock("Clustering", ClonotypeClusteringBlockPointer);

      type DatasetOption = { primary: { ref: unknown; label: string } };
      const datasets = await stableOutput<DatasetOption[]>(
        rawPrj,
        clusteringId,
        "datasetOptions",
        60000,
      );
      expect(datasets).toHaveLength(1);
      await patchBlockData(rawPrj, clusteringId, { datasetRef: datasets[0].primary.ref });

      type SequenceOption = { value: string; label: string };
      const sequences = await stableOutput<SequenceOption[]>(
        rawPrj,
        clusteringId,
        "sequenceOptions",
        60000,
      );
      expect(sequences.map((s) => s.label)).toEqual(["CDR3 aa"]);
      await patchBlockData(rawPrj, clusteringId, { sequencesRef: [sequences[0].value] });

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
