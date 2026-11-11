/*
  =============================================================================================
  VENDORED PROOF-OF-CONCEPT HELPER. NOT THE BLOCK'S CODE. DO NOT EXTEND HERE.
  =============================================================================================

  This file is a verbatim copy of `sdk/test/src/fixtures/xsv-spec.ts and sdk/test/src/fixtures/dataset.ts (merged)` from the `@platforma-sdk/test` proposal
  (milaboratory/platforma#1900, "block test kit"). It lives here only so this block's test
  suite can land before that SDK change is reviewed and released.

  When `@platforma-sdk/test` ships with this functionality, the follow-up is:
    1. bump the test package's `@platforma-sdk/test` to the released version,
    2. replace every `./vendored/...` import with `@platforma-sdk/test`,
    3. delete this folder.

  Until then, any fix needed here must be made in the SDK PR first and copied back, so the
  two do not drift. The only edits relative to the SDK source are the import paths at the
  top, rewritten to point at the sibling vendored files.

  What it does: the xsv-import spec builder and the declarative dataset shape
  (`DatasetShape`, `buildDataset`, `shapeSpec`, `renderTsv`) that the recorder publishes
  recordings with. The VDJ/peptide shapes of the SDK are not copied; this block keeps its own.

  =============================================================================================
*/

import type { ColumnUniversalId } from "@platforma-sdk/model";
import { randomUUID } from "node:crypto";

export type XsvValueType = "Int" | "Long" | "Float" | "Double" | "String";

type XsvRowParams = {
  /** Column label in the file. */
  column: string;
  /** Rows whose cell matches are skipped before anything else. */
  filterOutRegex?: string;
  /** Cells that match are NA; default checks the value parses as the declared type. */
  naRegex?: string;
  allowNA?: boolean;
};

export type XsvAxis = XsvRowParams & {
  spec: {
    /** Defaults to the file column label. */
    name?: string;
    type: XsvValueType;
    domain?: Record<string, string>;
    annotations?: Record<string, string>;
    parentAxes?: number[];
  };
};

export type XsvColumn = XsvRowParams & {
  /** Column id in the pool and saved file name; defaults to the label with `_` for symbols. */
  id?: string;
  spec: {
    /** Defaults to the file column label. */
    name?: string;
    valueType: XsvValueType;
    domain?: Record<string, string>;
    annotations?: Record<string, string>;
    /** Indexes into `axes` of the axes this column is keyed on; all of them when omitted. */
    parentAxes?: number[];
  };
};

export type XsvItem<T> = { id: string; disabled: boolean; expanded: boolean; payload: T };

export type XsvImportSpecInput = {
  axes: XsvAxis[];
  columns: XsvColumn[];
  separator?: string;
  commentLinePrefix?: string;
  skipEmptyLines?: boolean;
  columnNamePrefix?: string;
  storageFormat?: "Binary" | "Json";
  /** Leading axes to partition the stored columns by; 0 is a single partition. */
  partitionKeyLength?: number;
};

export type XsvImportSpec = Omit<XsvImportSpecInput, "axes" | "columns"> & {
  axes: XsvItem<XsvAxis>[];
  columns: XsvItem<XsvColumn>[];
};

const item = <T>(payload: T): XsvItem<T> => ({
  id: randomUUID(),
  disabled: false,
  expanded: false,
  payload,
});

export function xsvImportSpec(input: XsvImportSpecInput): XsvImportSpec {
  return {
    ...input,
    axes: input.axes.map(item),
    columns: input.columns.map(item),
    storageFormat: input.storageFormat ?? "Binary",
  };
}

/**
 * Render rows to TSV with `columns` as the header; a missing cell is empty. A cell holding
 * a tab or line break is rejected: TSV has no escaping, so it would change the table.
 */
export function renderTsv(
  columns: string[],
  rows: Record<string, string | number | undefined>[],
): string {
  const cell = (value: string | number | undefined): string => {
    const text = value === undefined ? "" : String(value);
    if (/[\t\r\n]/.test(text))
      throw new Error(`TSV cell holds a tab or line break: ${JSON.stringify(text)}`);
    return text;
  };
  const lines = [columns.map(cell).join("\t")];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(row[c])).join("\t"));
  }
  return lines.join("\n") + "\n";
}

/** One axis of a shape: its file column and its pool identity. */
export type ShapeAxis = {
  column: string;
  name: string;
  type?: XsvValueType;
  domain?: Record<string, string>;
  annotations?: Record<string, string>;
  /** Rows whose cell matches are skipped by every column keyed on this axis. */
  filterOutRegex?: string;
};

/** One column of a shape: its file column, its pool identity, and its role in the dataset. */
export type ShapeColumn = {
  column: string;
  name: string;
  valueType: XsvValueType;
  /** Indexes into `axes` this column is keyed on; every axis when omitted. */
  parentAxes?: number[];
  domain?: Record<string, string>;
  annotations?: Record<string, string>;
  /** Rows whose cell matches are skipped, not imported. */
  filterOutRegex?: string;
  /**
   * `anchor`: the abundance a consumer's `datasetRef` points at. `sequence`: the column a
   * consumer's sequence options report. `subset`: the filter a consumer's `filterRef` takes.
   */
  role?: "anchor" | "sequence" | "subset";
};

export type DatasetShape = {
  axes: ShapeAxis[];
  columns: ShapeColumn[];
  /** Leading axes to partition the stored columns by; 0 is a single partition. */
  partitionKeyLength?: number;
  storageFormat?: "Binary" | "Json";
};

/** One row, keyed by file column. A missing cell is empty. */
export type ShapeRow = Record<string, string | number | undefined>;

/** A table ready to publish through xsv-import. */
export type PublishableDataset = {
  spec: XsvImportSpec;
  content: string;
};

/**
 * A table ready to publish through xsv-import, with the handles a consuming block needs to
 * wire itself to it.
 */
export type SyntheticDataset = PublishableDataset & {
  /** File column of the anchor abundance, the ref a consumer's `datasetRef` points at. */
  anchorColumn: string;
  /**
   * Anchored id of the sequence column, as a consumer's sequence options report it. Set
   * when the shape has exactly one column with role `sequence`.
   */
  sequenceId?: ColumnUniversalId;
  /** File column of the subset column, when the dataset has one. */
  filterColumn?: string;
  /** The shape this dataset was built from. */
  shape: DatasetShape;
};

export const ANCHOR_ANNOTATIONS = {
  "pl7.app/isAnchor": "true",
  "pl7.app/isAbundance": "true",
  "pl7.app/abundance/isPrimary": "true",
  "pl7.app/abundance/normalized": "false",
  "pl7.app/abundance/unit": "cells",
  "pl7.app/label": "Number of Cells",
};

/**
 * The anchored id of a column keyed on `axes` of the `main` anchor, as the model's
 * anchored-id helpers produce it: domain keys sorted, then `name`.
 */
export function anchoredColumnId(
  name: string,
  domain: Record<string, string> = {},
  axes: number[] = [1],
): ColumnUniversalId {
  return JSON.stringify({
    axes: axes.map((idx) => ({ anchor: "main", idx })),
    domain: Object.fromEntries(Object.entries(domain).sort(([a], [b]) => a.localeCompare(b))),
    name,
  }) as ColumnUniversalId;
}

function roleColumns(shape: DatasetShape, role: ShapeColumn["role"]): ShapeColumn[] {
  return shape.columns.filter((c) => c.role === role);
}

function roleColumn(shape: DatasetShape, role: ShapeColumn["role"]): ShapeColumn | undefined {
  const hits = roleColumns(shape, role);
  if (hits.length > 1)
    throw new Error(`Shape has ${hits.length} ${role} columns: ${hits.map((c) => c.column)}`);
  return hits[0];
}

/** The handles a consumer wires with, read off a shape's column roles. */
function shapeHandles(shape: DatasetShape) {
  const anchor = roleColumn(shape, "anchor");
  if (anchor === undefined) throw new Error("Shape has no column with role 'anchor'");
  const sequences = roleColumns(shape, "sequence");
  const sequence = sequences.length === 1 ? sequences[0] : undefined;
  return {
    anchorColumn: anchor.column,
    sequenceId:
      sequence === undefined
        ? undefined
        : anchoredColumnId(sequence.name, sequence.domain, sequence.parentAxes),
    filterColumn: roleColumn(shape, "subset")?.column,
  };
}

/** File columns of a shape, axes first, in the order its TSV must carry them. */
export function shapeHeader(shape: DatasetShape): string[] {
  return [...shape.axes.map((a) => a.column), ...shape.columns.map((c) => c.column)];
}

/** Derive the xsv-import spec of a shape. */
export function shapeSpec(shape: DatasetShape): XsvImportSpec {
  return xsvImportSpec({
    axes: shape.axes.map((a) => ({
      column: a.column,
      filterOutRegex: a.filterOutRegex,
      spec: {
        name: a.name,
        type: a.type ?? "String",
        domain: a.domain,
        annotations: a.annotations,
      },
    })),
    columns: shape.columns.map((c) => ({
      column: c.column,
      filterOutRegex: c.filterOutRegex,
      spec: {
        name: c.name,
        valueType: c.valueType,
        parentAxes: c.parentAxes,
        domain: c.domain,
        annotations: c.annotations,
      },
    })),
    partitionKeyLength: shape.partitionKeyLength,
    storageFormat: shape.storageFormat,
  });
}

/** Render `rows` under `shape` into a dataset ready for `publishXsv`. */
export function buildDataset(shape: DatasetShape, rows: ShapeRow[]): SyntheticDataset {
  return {
    spec: shapeSpec(shape),
    content: renderTsv(shapeHeader(shape), rows),
    ...shapeHandles(shape),
    shape,
  };
}

/**
 * A committed TSV under `shape`: the file's header must list the shape's file columns in
 * order, so a drift between the two fails here and not inside the import.
 */
export function datasetFromTsv(shape: DatasetShape, content: string): SyntheticDataset {
  const header = content.split(/\r?\n/, 1)[0].split("\t");
  const expected = shapeHeader(shape);
  if (header.join("\t") !== expected.join("\t"))
    throw new Error(
      `TSV header does not match the shape.\n  file:  ${header.join(", ")}\n  shape: ${expected.join(", ")}`,
    );
  return { spec: shapeSpec(shape), content, ...shapeHandles(shape), shape };
}
