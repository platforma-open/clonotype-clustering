/*
  Test kit for driving clonotype-clustering over a synthetic dataset.

  The dataset is published into the result pool by the xsv-import block loaded from the
  sibling checkout (`dev-v2`), so no MiXCR run is needed. One publisher block carries every
  column: a block's workflow sees only the blocks its args reference by PlRef, so an
  anchored sequence column must live in the same block as the anchor it is matched against.

  SDK-BOUND: the parts marked `SDK-BOUND` below are block-agnostic and move to
  `@platforma-sdk/test` in milaboratory/platforma#1900 under these names:
    publishedRef                -> exportedRef
    vdjSpec / vdjSpecWithSubset / vdjTsv / vdjTsvWithSubset -> vdjDataset (declarative shape)
    peptideSpec / peptideTsv    -> peptideDataset
    VDJ_CDR3_ID / PEPTIDE_SEQUENCE_ID / CLONOTYPE_AXIS / VARIANT_AXIS -> same names
    awaitBlockDone / awaitBlockDoneObserved -> awaitBlockDone({ observeState })
    patchBlockData / stableOutput / addBlock -> same names
    publishTsv                  -> publishXsv
    Run.findColumns / findColumn / read / readById / readMap -> PFrameReader
  Once that releases, this file keeps only `runClustering`, the block-specific readers on
  `Run` (membership, clusterLabels, clusters, centroids), `clusterRows` and
  `sequencesByCluster`.
*/

import type { PColumnSpec, PFrameHandle, PObjectId } from "@platforma-sdk/model";
import {
  createPlDataTableStateV2,
  getStorageData,
  normalizeBlockStorage,
} from "@platforma-sdk/model";
import type { ML } from "@platforma-sdk/test";
import fs from "node:fs";
import path from "node:path";
import { ClonotypeClusteringBlockPointer } from "this-block";

export type Ctx = {
  rawPrj: ML.Project;
  ml: ML.MiddleLayer;
  helpers: { getLocalFileHandle(localPath: string): Promise<unknown> };
  tmpFolder: string;
};

/** Resources every test run asks for. Small, so parallel runs do not fight over cores. */
export const TEST_RESOURCES = { cpu: 2, mem: 4 };

const T0 = Date.now();
/** Phase timestamps for tuning the harness; enabled with TEST_TIMING=1. */
export const mark = (what: string) => {
  if (process.env.TEST_TIMING === "1")
    console.log(`T+${((Date.now() - T0) / 1000).toFixed(1)}s ${what}`);
};

/**
 * Canonical anchored ids of the fixture sequence columns, as `sequenceOptions` reports
 * them: axis 1 of the dataset anchor, the column name, and its full domain (keys sorted).
 * discovery.test.ts checks the model derives exactly these; every other scenario sets
 * them directly and skips two staging round trips.
 */
// SDK-BOUND: canonical anchored ids move to @platforma-sdk/test fixtures.
export const VDJ_CDR3_ID = JSON.stringify({
  axes: [{ anchor: "main", idx: 1 }],
  domain: { "pl7.app/alphabet": "aminoacid", "pl7.app/vdj/feature": "CDR3" },
  name: "pl7.app/vdj/sequence",
});
export const PEPTIDE_SEQUENCE_ID = JSON.stringify({
  axes: [{ anchor: "main", idx: 1 }],
  domain: { "pl7.app/alphabet": "aminoacid", "pl7.app/feature": "peptide" },
  name: "pl7.app/sequence",
});

// SDK-BOUND: becomes `exportedRef(blockId, "outputPf", column)`.
/** The pool ref of a column xsv-import published under `outputPf`. */
export const publishedRef = (blockId: string, column: string) => ({
  __isRef: true,
  blockId,
  name: `outputPf.${column}`,
});

export const xsvImportFolder = path.resolve(import.meta.dirname, "../../../xsv-import/block");
export const hasXsvImport = fs.existsSync(
  path.join(xsvImportFolder, "block-pack", "manifest.json"),
);

// ---------------------------------------------------------------------------
// Fixture rows → xsv-import spec
// SDK-BOUND: this whole section becomes the declarative shapes (`vdjDataset`,
// `peptideDataset`, `buildDataset`) in @platforma-sdk/test.
// ---------------------------------------------------------------------------

/** One input row. `sample` defaults to "S1"; `label` to the key. */
export type Clonotype = {
  key: string;
  seq: string;
  count: number;
  sample?: string;
  label?: string;
};

const item = <T>(payload: T) => ({
  id: crypto.randomUUID(),
  disabled: false,
  expanded: false,
  payload,
});

export const CLONOTYPE_AXIS = {
  name: "pl7.app/vdj/clonotypeKey",
  type: "String",
  domain: { "pl7.app/vdj/clonotypingRunId": "xsv-fixture" },
  annotations: { "pl7.app/label": "Clonotype key" },
};

const ANCHOR_ANNOTATIONS = {
  "pl7.app/isAnchor": "true",
  "pl7.app/isAbundance": "true",
  "pl7.app/abundance/isPrimary": "true",
  "pl7.app/abundance/normalized": "false",
  "pl7.app/abundance/unit": "cells",
  "pl7.app/label": "Number of Cells",
};

/**
 * Bulk VDJ dataset shape: the anchor abundance on [sampleId, clonotypeKey] (partitioned by
 * sample, which the block's anonymize step needs), and the CDR3 and label columns keyed on
 * the clonotype axis alone via `parentAxes`, as MiXCR publishes them.
 */
export function vdjSpec() {
  return {
    axes: [
      item({ column: "sampleId", spec: { name: "pl7.app/sampleId", type: "String" } }),
      item({ column: "clonotypeKey", spec: CLONOTYPE_AXIS }),
    ],
    columns: [
      item({
        column: "cellCount",
        spec: {
          name: "pl7.app/vdj/uniqueCellCount",
          valueType: "Long",
          annotations: ANCHOR_ANNOTATIONS,
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
  };
}

/** VDJ spec with an extra `pl7.app/isSubset` column on the clonotype axis; empty cells are NA. */
export function vdjSpecWithSubset(subsetLabel = "Picked") {
  const spec = vdjSpec();
  spec.columns.push(
    item({
      column: "tag",
      // Rows the subset does not mark are skipped, not imported as NA: a subset column's
      // members are the keys it has rows for.
      filterOutRegex: "^$",
      spec: {
        name: "pl7.app/vdj/subset",
        valueType: "Int",
        parentAxes: [1],
        annotations: { "pl7.app/label": subsetLabel, "pl7.app/isSubset": "true" },
      },
    }) as never,
  );
  return spec;
}

export function vdjTsvWithSubset(rows: Clonotype[], tagged: string[]): string {
  const lines = ["sampleId\tclonotypeKey\tcellCount\tcdr3aa\tlabel\ttag"];
  for (const r of rows) {
    const tag = tagged.includes(r.key) ? "1" : "";
    lines.push([r.sample ?? "S1", r.key, String(r.count), r.seq, r.label ?? r.key, tag].join("\t"));
  }
  return lines.join("\n") + "\n";
}

export const VARIANT_AXIS = {
  name: "pl7.app/variantKey",
  type: "String",
  domain: { "pl7.app/peptide/extractionRunId": "xsv-fixture" },
  annotations: { "pl7.app/label": "Variant" },
};

/** Peptide dataset shape, as peptide-extraction publishes it. */
export function peptideSpec() {
  return {
    axes: [
      item({ column: "sampleId", spec: { name: "pl7.app/sampleId", type: "String" } }),
      item({ column: "variantKey", spec: VARIANT_AXIS }),
    ],
    columns: [
      item({
        column: "cellCount",
        spec: { name: "pl7.app/abundance", valueType: "Long", annotations: ANCHOR_ANNOTATIONS },
      }),
      item({
        column: "sequence",
        spec: {
          name: "pl7.app/sequence",
          valueType: "String",
          parentAxes: [1],
          domain: { "pl7.app/feature": "peptide", "pl7.app/alphabet": "aminoacid" },
          annotations: { "pl7.app/label": "Peptide sequence" },
        },
      }),
      item({
        column: "label",
        spec: {
          name: "pl7.app/label",
          valueType: "String",
          parentAxes: [1],
          annotations: { "pl7.app/label": "Variant label" },
        },
      }),
      // peptide-extraction publishes the length; the block sizes its short-peptide mmseqs2
      // tuning from its minimum.
      item({
        column: "length",
        spec: {
          name: "pl7.app/sequenceLength",
          valueType: "Int",
          parentAxes: [1],
          domain: { "pl7.app/feature": "peptide" },
          annotations: { "pl7.app/label": "Peptide length" },
        },
      }),
    ],
    storageFormat: "Binary",
    partitionKeyLength: 1,
  };
}

export function peptideTsv(rows: Clonotype[]): string {
  const lines = ["sampleId\tvariantKey\tcellCount\tsequence\tlabel\tlength"];
  for (const r of rows) {
    lines.push(
      [
        r.sample ?? "S1",
        r.key,
        String(r.count),
        r.seq,
        r.label ?? r.key,
        String(r.seq.length),
      ].join("\t"),
    );
  }
  return lines.join("\n") + "\n";
}

export function vdjTsv(rows: Clonotype[]): string {
  const lines = ["sampleId\tclonotypeKey\tcellCount\tcdr3aa\tlabel"];
  for (const r of rows) {
    lines.push([r.sample ?? "S1", r.key, String(r.count), r.seq, r.label ?? r.key].join("\t"));
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Block driving
// SDK-BOUND: awaitBlockDone*, patchBlockData, stableOutput, addBlock and publishTsv move to
// @platforma-sdk/test; runClustering stays here.
// ---------------------------------------------------------------------------

/**
 * Wait for Done while keeping the block state observed. A lazy-state block renders its
 * outputs only while something reads its state, and the `fileUploader` output is what
 * starts the local-file upload, so a wait on the overview alone never uploads anything.
 */
export async function awaitBlockDoneObserved(
  rawPrj: ML.Project,
  blockId: string,
  timeoutMs: number,
) {
  return await awaitBlockDone(rawPrj, blockId, timeoutMs, true);
}

/**
 * Wait for Done on the project overview alone. Reading a block's state renders every one of
 * its outputs, so a block that uploads nothing is cheaper to wait for this way.
 */
export async function awaitBlockDone(
  rawPrj: ML.Project,
  blockId: string,
  timeoutMs: number,
  observeState = false,
) {
  const state = observeState ? rawPrj.getBlockState(blockId) : undefined;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state !== undefined) await state.getValue();
    const overview = (await rawPrj.overview.getValue())!.blocks.find((b) => b.id === blockId);
    if (overview === undefined) throw new Error(`Block not found: ${blockId}`);
    if (overview.outputErrors) {
      throw new Error(
        "Block error: " + (overview.outputsError ?? overview.exportsError ?? "no message"),
      );
    }
    if (overview.calculationStatus === "Done") return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Block ${blockId} did not reach Done within ${timeoutMs} ms`);
}

/** Merge a patch into a V3 block's persisted data. */
export async function patchBlockData(
  rawPrj: ML.Project,
  blockId: string,
  patch: Record<string, unknown>,
) {
  const state = (await rawPrj.getBlockState(blockId).getValue()) as { blockStorage: unknown };
  const raw =
    typeof state.blockStorage === "string" ? JSON.parse(state.blockStorage) : state.blockStorage;
  const current = getStorageData<Record<string, unknown>>(normalizeBlockStorage(raw));
  await rawPrj.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: { ...current, ...patch },
  });
}

export async function stableOutput<T>(
  rawPrj: ML.Project,
  blockId: string,
  name: string,
  timeoutMs: number,
): Promise<T> {
  // Poll rather than await stability: the stability wait gives up after a fixed number of
  // tree changes, which a busy backend exceeds long before anything is wrong.
  const state = rawPrj.getBlockState(blockId);
  const deadline = Date.now() + timeoutMs;
  let last: { ok: boolean; value?: unknown; errors?: unknown; stable?: boolean } | undefined;
  while (Date.now() < deadline) {
    const s = await state.getValue();
    last = (s.outputs as Record<string, typeof last>)[name];
    if (last?.ok && last.value !== undefined && last.stable !== false) return last.value as T;
    if (last !== undefined && !last.ok)
      throw new Error(`Output ${name} is not ok: ${JSON.stringify(last.errors)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Output ${name} of ${blockId} did not settle within ${timeoutMs} ms: ${JSON.stringify(last)}`,
  );
}

/**
 * `rawPrj.addBlock` with a bounded retry on a stale template reference. Under concurrent
 * block additions the middle layer's template cache can hand out a template resource the
 * backend has since dropped ("target resource ... does not exist"); the next attempt loads
 * the template afresh.
 */
export async function addBlock(
  rawPrj: ML.Project,
  label: string,
  spec: Parameters<ML.Project["addBlock"]>[1],
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rawPrj.addBlock(label, spec);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (attempt >= 3 || !/does not exist/.test(message)) throw e;
      console.warn(
        `addBlock(${label}) hit a stale template reference (attempt ${attempt}); retrying`,
      );
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
    }
  }
}

/** Publish a TSV through an xsv-import block; returns the publisher's block id. */
export async function publishTsv(
  ctx: Ctx,
  label: string,
  tsv: string,
  spec: unknown,
): Promise<string> {
  // One file per publish: an uploader checks the file's mtime, so two scenarios publishing
  // the same dataset must never share a path.
  const file = path.join(ctx.tmpFolder, `${label.replace(/\W+/g, "_")}-${crypto.randomUUID()}.tsv`);
  fs.writeFileSync(file, tsv);
  const blockId = await addBlock(ctx.rawPrj, label, { type: "dev-v2", folder: xsvImportFolder });
  const fileHandle = await ctx.helpers.getLocalFileHandle(file);
  await ctx.rawPrj.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: { fileHandle, spec, tableState: createPlDataTableStateV2() },
  });
  mark(`publish ${label}: uploading`);
  await ctx.rawPrj.runBlock(blockId);
  await awaitBlockDoneObserved(ctx.rawPrj, blockId, 90000);
  mark(`publish ${label}: done`);
  return blockId;
}

export type DatasetOption = {
  primary: { ref: unknown; label: string };
  filters?: { ref: unknown; label: string }[];
};
export type SequenceOption = { value: string; label: string };

/**
 * Add the clustering block, point it at the first discovered dataset and its first sequence
 * column, apply `patch` on top of the block's defaults, and run it to Done.
 */
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
    await patchBlockData(rawPrj, blockId, {
      datasetRef: publishedRef(opts.datasetBlockId, anchorColumn),
      sequencesRef: [sequenceId],
      ...(filterColumn === undefined
        ? {}
        : { filterRef: publishedRef(opts.datasetBlockId, filterColumn) }),
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
  const columns = (await ctx.ml.driverKit.pFrameDriver.listColumns(pf)).filter((c) => {
    try {
      return (JSON.parse(c.columnId) as { resolvePath?: unknown }).resolvePath !== undefined;
    } catch {
      return false;
    }
  });
  mark(`run ${blockId.slice(0, 8)}: pf listed`);
  return new Run(ctx, blockId, pf, columns, opts.keyAxis);
}

export type ColumnQuery = {
  name: string;
  /** Axis names, in order. */
  axes?: string[];
  /** Domain entries that must be present. */
  domain?: Record<string, string>;
};

/**
 * A finished clustering run and readers over its exported PFrame.
 * SDK-BOUND: findColumns / findColumn / read / readById / readMap become `PFrameReader`;
 * membership / clusterLabels / clusters / centroids stay here.
 */
export class Run {
  constructor(
    readonly ctx: Ctx,
    readonly blockId: string,
    readonly pf: PFrameHandle,
    readonly columns: { columnId: PObjectId; spec: PColumnSpec }[],
    /** Name of the per-row key axis: clonotypeKey for VDJ input, variantKey for peptides. */
    readonly keyAxis = "pl7.app/vdj/clonotypeKey",
  ) {}

  findColumns(q: ColumnQuery) {
    return this.columns.filter(({ spec }) => {
      if (spec.name !== q.name) return false;
      if (q.axes && JSON.stringify(spec.axesSpec.map((a) => a.name)) !== JSON.stringify(q.axes))
        return false;
      if (q.domain && Object.entries(q.domain).some(([k, v]) => spec.domain?.[k] !== v))
        return false;
      return true;
    });
  }

  findColumn(q: ColumnQuery) {
    const hits = this.findColumns(q);
    if (hits.length !== 1) {
      const seen = this.columns.map(
        (c) => `${c.spec.name} [${c.spec.axesSpec.map((a) => a.name).join(", ")}]`,
      );
      throw new Error(
        `Expected one column for ${JSON.stringify(q)}, found ${hits.length}. Columns: ${seen.join("; ")}`,
      );
    }
    return hits[0];
  }

  /** Rows of one column as `[axisKeys..., value]`, NA as null. Row order is not meaningful. */
  async read(q: ColumnQuery): Promise<{ keys: string[]; value: string | number | null }[]> {
    return await this.readById(this.findColumn(q).columnId);
  }

  async readById(
    columnId: PObjectId,
  ): Promise<{ keys: string[]; value: string | number | null }[]> {
    const table = await this.ctx.ml.driverKit.pFrameDriver.calculateTableData(this.pf, {
      src: { type: "column", column: columnId },
      filters: [],
      sorting: [],
    });
    const axes = table.filter((c) => c.spec.type === "axis");
    const col = table.find((c) => c.spec.type === "column");
    if (col === undefined) throw new Error("Column data missing from table response");
    const n = col.data.data.length;
    const isNA = (v: { isNA?: Uint8Array }, i: number) =>
      v.isNA !== undefined && (v.isNA[Math.floor(i / 8)] & (1 << (7 - (i % 8)))) !== 0;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const keys = axes.map((a) => String(a.data.data[i]));
      const raw = col.data.data[i];
      const value = isNA(col.data, i)
        ? null
        : typeof raw === "bigint"
          ? Number(raw)
          : (raw as string | number);
      rows.push({ keys, value });
    }
    return rows;
  }

  /** Map of a single-axis column: axis key → value. */
  async readMap(q: ColumnQuery): Promise<Map<string, string | number | null>> {
    const rows = await this.read(q);
    return new Map(rows.map((r) => [r.keys[r.keys.length - 1], r.value]));
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
  await publishTsv(ctx, "Fixture dataset", vdjTsv(rows), vdjSpec());
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
