import { assertParamsObject } from "@platforma-sdk/block-kind";
import {
  isAnchoredPColumnId,
  isColumnUniversalId,
  isPlRef,
  parseJsonSafely,
  type SUniversalPColumnId,
} from "@platforma-sdk/model";
import { isBoolean, isString } from "es-toolkit";
import { isArray, isNumber } from "es-toolkit/compat";
import type {
  BlockParams,
  CentroidAlignment,
  ClusteringTool,
  CoverageMode,
  SequenceType,
  SimilarityType,
} from "./types";

/**
 * The contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * Each field the contract names is read and checked; a key it does not name is
 * dropped by never being read, so it needs no rejection here. Params written
 * against a different version of the contract are caught by the version in the
 * template entry's `{name}@{selector}` reference, not by a key-set check.
 */
export function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const params: Record<string, unknown> = {};
  for (const [field, { is, must }] of Object.entries(CONTRACT)) {
    const raw = value[field];
    if (raw === undefined) continue;
    if (!is(raw)) throw new Error(`'${field}' must be ${must}.`);
    params[field] = raw;
  }
  // Every value placed here passed its own field's guard, and `CONTRACT` is
  // proven exhaustive over `BlockParams` by the `satisfies` below.
  return params as BlockParams;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type Guard<T> = (value: unknown) => value is T;

/** A guard plus how to finish the sentence "'field' must be …". */
type Check<T> = { readonly is: Guard<T>; readonly must: string };

function check<T>(is: Guard<T>, must: string): Check<T> {
  return { is, must };
}

function oneOf<T extends string | number>(...allowed: readonly T[]): Guard<T> {
  return (v): v is T => allowed.includes(v as T);
}

function arrayOf<T>(item: Guard<T>): Guard<T[]> {
  return (v): v is T[] => isArray(v) && v.every((e) => item(e));
}

/**
 * A column identifier as this block stores it: a canonically serialized JSON
 * key. `isColumnUniversalId` covers the four key forms the SDK's id encoding
 * uses, but every column id here comes from `resultPool.getCanonicalOptions`,
 * which mints an *anchored* key — a shape none of those four recognizes even
 * though the SDK types it `SUniversalPColumnId`. Both forms are accepted, or
 * the kind would refuse ids the block itself writes.
 */
const isColumnId: Guard<SUniversalPColumnId> = (v): v is SUniversalPColumnId =>
  isString(v) && (isColumnUniversalId(v) || isAnchoredPColumnId(parseJsonSafely(v)));

const REF = "a reference to another block's output";
const COLUMN_IDS = "an array of column ids";
const FRACTION = "a number";

/**
 * The contract, field by field, at runtime.
 *
 * The `satisfies` clause is the drift guard: it demands an entry for every key
 * `BlockParams` declares, and types each guard against that key's own type. Add
 * a field to the contract and this stops compiling until the check exists —
 * which matters here because every field is optional, so a parser that simply
 * forgot one would otherwise return a valid `BlockParams` and say nothing.
 *
 * The thresholds are checked as numbers, not as fractions in `[0, 1]`. A value
 * out of range is a configuration the block itself has to answer for, and the
 * ranges live with the sliders that set them; restating them here would make the
 * kind refuse a file the UI can produce the moment either side moves.
 */
const CONTRACT = {
  datasetRef: check(isPlRef, REF),
  sequencesRef: check(arrayOf(isColumnId), COLUMN_IDS),
  sequenceType: check(
    oneOf<SequenceType>("aminoacid", "nucleotide"),
    "one of: aminoacid, nucleotide",
  ),

  identity: check(isNumber, FRACTION),
  similarityType: check(
    oneOf<SimilarityType>(
      "sequence-identity",
      "blosum40",
      "blosum50",
      "blosum62",
      "blosum80",
      "blosum90",
    ),
    "one of: sequence-identity, blosum40, blosum50, blosum62, blosum80, blosum90",
  ),
  coverageThreshold: check(isNumber, FRACTION),
  coverageMode: check(oneOf<CoverageMode>(0, 1, 2, 3, 4, 5), "one of: 0, 1, 2, 3, 4, 5"),
  highPrecision: check(isBoolean, "a boolean"),
  trimStart: check(isNumber, "a number"),
  trimEnd: check(isNumber, "a number"),
  clusteringTool: check(
    oneOf<ClusteringTool>("easy-cluster", "easy-linclust"),
    "one of: easy-cluster, easy-linclust",
  ),

  consensusThreshold: check(isNumber, FRACTION),
  gapThreshold: check(isNumber, FRACTION),
  centroidAlignment: check(
    oneOf<CentroidAlignment>("auto", "gapped", "ungapped"),
    "one of: auto, gapped, ungapped",
  ),
  weightByAbundance: check(isBoolean, "a boolean"),
  generateDataset: check(isBoolean, "a boolean"),

  mem: check(isNumber, "a number"),
  cpu: check(isNumber, "a number"),

  defaultBlockLabel: check(isString, "a string"),
  customBlockLabel: check(isString, "a string"),
} satisfies { [K in keyof BlockParams]-?: Check<NonNullable<BlockParams[K]>> };
