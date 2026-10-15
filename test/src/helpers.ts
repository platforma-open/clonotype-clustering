/*
  Test kit for driving clonotype-clustering over a synthetic dataset.

  The dataset is published into the result pool by the published xsv-import
  block, so no MiXCR run is needed. The generic parts (publishing,
  waits, block data, PFrame readers, dataset shapes) come from `@platforma-sdk/test`; this
  file holds what is specific to the clustering block: how to wire and run it, and how to
  read its outputs.
*/

import { XsvImportBlockPointer } from "@platforma-open/milaboratories.xsv-import";
import type { PFrameHandle } from "@platforma-sdk/model";
import type { BlockTestCtx, SequenceRow, SyntheticDataset } from "@platforma-sdk/test";
import {
  PFrameReader,
  addBlock,
  awaitBlockDone,
  exportedRef,
  listLocalColumns,
  patchBlockData,
  publishXsv,
  stableOutput,
  vdjDataset,
} from "@platforma-sdk/test";
import { ClonotypeClusteringBlockPointer } from "this-block";

export type Ctx = BlockTestCtx;
/** One input row. `sample` defaults to "S1"; `label` to the key. */
export type Clonotype = SequenceRow;

/** Resources every test run asks for. Small, so parallel runs do not fight over cores. */
export const TEST_RESOURCES = { cpu: 2, mem: 4 };

const T0 = Date.now();
/** Phase timestamps for tuning the harness; enabled with TEST_TIMING=1. */
export const mark = (what: string) => {
  if (process.env.TEST_TIMING === "1")
    console.log(`T+${((Date.now() - T0) / 1000).toFixed(1)}s ${what}`);
};

/** The published xsv-import block; `XSV_IMPORT_BLOCK_DIR` points at a local build instead. */
export const XSV_IMPORT_BLOCK: Parameters<typeof publishXsv>[1]["block"] =
  process.env.XSV_IMPORT_BLOCK_DIR === undefined
    ? XsvImportBlockPointer
    : { type: "dev-v2", folder: process.env.XSV_IMPORT_BLOCK_DIR };

/** Publish a dataset through xsv-import; returns the publisher's block id. */
export async function publishDataset(
  ctx: Ctx,
  label: string,
  dataset: SyntheticDataset,
): Promise<string> {
  mark(`publish ${label}: uploading`);
  const blockId = await publishXsv(ctx, {
    label,
    block: XSV_IMPORT_BLOCK,
    spec: dataset.spec,
    content: dataset.content,
  });
  mark(`publish ${label}: done`);
  return blockId;
}

// ---------------------------------------------------------------------------
// Block driving
// ---------------------------------------------------------------------------

export type DatasetOption = {
  primary: { ref: unknown; label: string };
  filters?: { ref: unknown; label: string }[];
};
export type SequenceOption = { value: string; label: string };

export type RunOptions = {
  keyAxis?: string;
  /**
   * Set the dataset anchor, sequence column and optional subset directly instead of
   * discovering them through the model's option outputs.
   */
  direct?: { anchorColumn: string; sequenceId: string; filterColumn?: string };
  /** Publisher block of the dataset to cluster; required when the project holds several. */
  datasetBlockId?: string;
  /** Pick the dataset's subset filter whose ref name ends with this, and set `filterRef` to it. */
  filterName?: string;
};

/**
 * Add the clustering block, point it at the first discovered dataset and its first sequence
 * column (or wire it directly), apply `patch` on top of the block's defaults, and run it
 * to Done.
 */
export async function runClustering(
  ctx: Ctx,
  patch: Record<string, unknown> = {},
  opts: RunOptions = {},
): Promise<Run> {
  const { rawPrj } = ctx;
  const blockId = await addBlock(rawPrj, "Clustering", ClonotypeClusteringBlockPointer);

  if (opts.direct !== undefined) {
    if (opts.datasetBlockId === undefined) throw new Error("direct wiring needs datasetBlockId");
    const { anchorColumn, sequenceId, filterColumn } = opts.direct;
    const published = (column: string) => exportedRef(opts.datasetBlockId!, "outputPf", column);
    await patchBlockData(rawPrj, blockId, {
      datasetRef: published(anchorColumn),
      sequencesRef: [sequenceId],
      ...(filterColumn === undefined ? {} : { filterRef: published(filterColumn) }),
      ...TEST_RESOURCES,
      ...patch,
    });
  } else {
    const options = await stableOutput<DatasetOption[]>(rawPrj, blockId, "datasetOptions", 180000);
    const datasets =
      opts.datasetBlockId === undefined
        ? options
        : options.filter(
            (d) => (d.primary.ref as { blockId?: string }).blockId === opts.datasetBlockId,
          );
    if (datasets.length !== 1)
      throw new Error(`Expected one dataset option, got ${datasets.length}`);
    const dataPatch: Record<string, unknown> = { datasetRef: datasets[0].primary.ref };
    if (opts.filterName !== undefined) {
      const filter = datasets[0].filters?.find((f) =>
        String((f.ref as { name?: string }).name).endsWith(opts.filterName!),
      );
      if (filter === undefined) {
        throw new Error(
          `No subset filter named ${opts.filterName}; offered: ${JSON.stringify(datasets[0].filters)}`,
        );
      }
      dataPatch.filterRef = filter.ref;
    }
    await patchBlockData(rawPrj, blockId, dataPatch);

    const sequences = await stableOutput<SequenceOption[]>(
      rawPrj,
      blockId,
      "sequenceOptions",
      180000,
    );
    if (sequences.length === 0) throw new Error("No sequence options discovered");
    await patchBlockData(rawPrj, blockId, {
      sequencesRef: [sequences[0].value],
      ...TEST_RESOURCES,
      ...patch,
    });
  }

  mark(`run ${blockId.slice(0, 8)}: start`);
  await rawPrj.runBlock(blockId);
  await awaitBlockDone(rawPrj, blockId, 540000);
  mark(`run ${blockId.slice(0, 8)}: done`);

  const pf = await stableOutput<PFrameHandle>(rawPrj, blockId, "clustersPf", 180000);
  // The graphs PFrame carries every pool column the block can see, including the input
  // dataset and sibling clustering blocks; this block's own outputs are the local-form ids.
  const driver = ctx.ml.driverKit.pFrameDriver;
  const columns = await listLocalColumns(driver, pf);
  mark(`run ${blockId.slice(0, 8)}: pf listed`);
  return new Run(ctx, blockId, pf, columns, opts.keyAxis);
}

/** A finished clustering run and readers over its exported PFrame. */
export class Run extends PFrameReader {
  constructor(
    readonly ctx: Ctx,
    readonly blockId: string,
    pf: PFrameHandle,
    columns: PFrameReader["columns"],
    /** Name of the per-row key axis: clonotypeKey for VDJ input, variantKey for peptides. */
    readonly keyAxis = "pl7.app/vdj/clonotypeKey",
  ) {
    super(ctx.ml.driverKit.pFrameDriver, pf, columns);
  }

  /**
   * clonotypeKey → clusterId, read from the linker column, whose cluster axis carries the
   * same id the centroid and per-cluster columns are keyed on. (`pl7.app/clusterId` on the
   * clonotype axis holds the display label, "CL-<id>".)
   */
  async membership(): Promise<Map<string, string>> {
    // With a centroid dataset exported, a second linker joins clusters to that new
    // library; its row axis is re-stamped with this block's id, the clone linker's is not.
    const links = this.findColumns({
      name: "pl7.app/link",
      axes: ["pl7.app/clusterId", this.keyAxis],
    }).filter((c) => c.spec.axesSpec[1].domain?.["pl7.app/clustering/blockId"] === undefined);
    if (links.length !== 1)
      throw new Error(`Expected one clone-to-cluster linker, found ${links.length}`);
    const rows = await this.readById(links[0].columnId);
    return new Map(rows.map((r) => [r.keys[1], r.keys[0]]));
  }

  /** clonotypeKey → cluster display label. */
  async clusterLabels(): Promise<Map<string, string>> {
    const m = await this.readMap({ name: "pl7.app/clusterId", axes: [this.keyAxis] });
    return new Map([...m].map(([k, v]) => [k, String(v)]));
  }

  /** Cluster members grouped by cluster id, each sorted. */
  async clusters(): Promise<string[][]> {
    const byCluster = new Map<string, string[]>();
    for (const [key, cluster] of await this.membership()) {
      byCluster.set(cluster, [...(byCluster.get(cluster) ?? []), key]);
    }
    return [...byCluster.values()].map((m) => m.sort()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  /** clusterId → sequence, for the centroid flavour named by `sequenceContent`. */
  async centroids(content: "centroid" | "referenceCentroid"): Promise<Map<string, string>> {
    const m = await this.readMap({
      name: this.keyAxis === "pl7.app/variantKey" ? "pl7.app/sequence" : "pl7.app/vdj/sequence",
      axes: ["pl7.app/clusterId"],
      domain: { "pl7.app/clustering/sequenceContent": content },
    });
    return new Map([...m].map(([k, v]) => [k, String(v)]));
  }
}

/** Publish `rows` as one VDJ dataset and run clustering over it with `patch` applied. */
export async function clusterRows(
  ctx: Ctx,
  rows: Clonotype[],
  patch: Record<string, unknown> = {},
): Promise<Run> {
  await publishDataset(ctx, "Fixture dataset", vdjDataset(rows));
  return await runClustering(ctx, patch);
}

/** Group the sequence map by cluster membership: cluster id → member sequences. */
export function sequencesByCluster(
  rows: Clonotype[],
  membership: Map<string, string>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const c = membership.get(r.key);
    if (c === undefined) throw new Error(`Row ${r.key} has no cluster`);
    out.set(c, [...(out.get(c) ?? []), r.seq]);
  }
  return out;
}
