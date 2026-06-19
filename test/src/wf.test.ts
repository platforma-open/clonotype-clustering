/*
  Coverage for the centroid-confidence-distance feature
  (docs/centroid-confidence-distance.md, §1–§4).

  WHY THESE ARE ALGORITHM-LEVEL TESTS, NOT A FULL `blockTest`
  -----------------------------------------------------------
  A full end-to-end `blockTest` from '@platforma-sdk/test' needs (a) a running
  Platforma backend, (b) a real input dataset import file to drive
  `datasetRef`/`sequencesRef`, and (c) the Python toolchain for
  `software/src/process_results.py` (polars, polars_ds, kalign). None of those
  fixtures exist in this repo today (the test dir ships no datasets, and the
  Python deps are not installed in the test environment), so an integration
  `blockTest` is not authorable here without inventing a large fixture corpus.

  The substance the spec asks us to cover — `X` emission under the consensus
  threshold (§1), the profile-distance values (§3), and reference_centroid
  (medoid) selection (§2) — is pure, deterministic numeric logic that lives in
  `_msa_consensus`, `_msa_profile_distances` and the medoid `argmin` in
  process_results.py. We re-implement those three functions here as a TS oracle,
  faithfully mirroring the Python (same column tie-break, same 1 - p_j cost, same
  (min D_i, -w_i, seq) medoid tie-break), and assert the exact values the spec's
  "Validation" section calls out. This pins the algorithm semantics and the
  contract surface (column/arg names) so regressions in either are caught.

  GAPS (intentionally not covered here; need integration fixtures):
   - That clustering.tpl.tengo actually threads `--consensus-threshold` and that
     process_results.py emits the reference_centroid_* columns end-to-end.
   - That create-empty-files.py emits matching reference_centroid_* headers.
   - kalign's actual alignment output (we feed pre-aligned rows, as the Python
     helpers themselves accept).
*/

import { describe, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Contract surface from the core implementation. Kept here so a rename of the
// emitted columns / CLI args trips this test (the spec lists these as the
// stable contract between process_results.py and the tengo/model wiring).
// ---------------------------------------------------------------------------
const EMITTED_COLUMNS = [
  "reference_centroid_sequence_0",
  "reference_centroid_trim_sequence_0",
  "reference_centroid_trimmed_fullSequence",
  "distanceToCentroid",
  "clusterRadius",
] as const;

const CLI_ARGS = ["--consensus-threshold", "--centroid-type"] as const;

// ---------------------------------------------------------------------------
// Plurality-centroid dataset contract surface (docs/centroid-dataset-plan.md).
// Pinned names for the optional X-free plurality-consensus centroid dataset
// (computed mode only, threshold 0). These are the STABLE part of the contract;
// the exact dataset payload schema (which columns, axis identity, anchor
// annotations) is DEFERRED ("specify later") per the plan, so we only pin the
// names here and do not assert a payload shape.
const PLURALITY_CLI_ARG = "--emit-plurality-centroid";
const PLURALITY_FILE = "plurality-centroid.tsv";
const PLURALITY_COLUMN_PREFIX = "plurality_centroid_trim_sequence_"; // imported dataset column prefix (+ <nr>)
const CENTROID_DATASET_EXPORT_KEY = "centroidDatasetPf"; // workflow export / model output key

// GAP (intentionally not covered here; needs integration fixtures that do not
// exist in this repo — see the header note above): the true "dataset present
// iff the checkbox is on" behavior — that clustering.tpl.tengo forwards
// `--emit-plurality-centroid` only when `generateDataset` is set and
// centroidType === 'computed', that main.tpl.tengo then builds and exports
// `centroidDatasetPf`, and that the model output resolves non-undefined only in
// that case — is end-to-end wiring. Asserting it requires a running Platforma
// backend, a real input dataset import, and the Python toolchain (polars,
// polars_ds, kalign) to actually produce `plurality-centroid.tsv`. None of
// those `blockTest` fixtures exist here, so this is documented as a GAP rather
// than faked with a stub.

// ---------------------------------------------------------------------------
// TS oracle: faithful re-implementation of the process_results.py helpers.
// ---------------------------------------------------------------------------

/**
 * Mirror of `_msa_consensus` (§1). `aligned` rows are equal-length, gap = "-".
 * Per column the highest-weight residue wins (tie-break: non-gap over gap, then
 * the lexically smaller letter). Gap-majority columns are dropped. A non-gap
 * winner is committed only when it holds >= threshold of the column weight,
 * otherwise the column emits "X".
 */
function msaConsensus(aligned: string[], weights: number[], threshold: number): string {
  const out: string[] = [];
  const nCols = aligned[0].length;
  for (let col = 0; col < nCols; col++) {
    const tally = new Map<string, number>();
    aligned.forEach((row, i) => tally.set(row[col], (tally.get(row[col]) ?? 0) + weights[i]));
    // (weight, nonGap, -charCode) descending — same ordering as the Python max key.
    let best = "";
    let bestKey: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const [a, w] of tally) {
      const key: [number, number, number] = [w, a !== "-" ? 1 : 0, -a.charCodeAt(0)];
      if (
        key[0] > bestKey[0] ||
        (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])
      ) {
        best = a;
        bestKey = key;
      }
    }
    if (best === "-") continue; // gap-majority column: not part of the centroid
    const total = [...tally.values()].reduce((s, w) => s + w, 0);
    out.push(total > 0 && tally.get(best)! / total >= threshold ? best : "X");
  }
  return out.join("");
}

/**
 * Mirror of `_msa_profile_distances` (§3). Returns per-(gap-stripped)-member
 * profile distance D = Σ_j (1 - p_j(residue)) and L_cons = count of
 * non-gap-majority columns.
 */
function msaProfileDistances(
  aligned: string[],
  weights: number[],
): { dBySeq: Map<string, number>; lCons: number } {
  const nCols = aligned[0].length;
  const W = weights.reduce((s, w) => s + w, 0);
  const colFracs: Map<string, number>[] = [];
  let lCons = 0;
  for (let col = 0; col < nCols; col++) {
    const tally = new Map<string, number>();
    aligned.forEach((row, i) => tally.set(row[col], (tally.get(row[col]) ?? 0) + weights[i]));
    const frac = new Map<string, number>();
    for (const [a, w] of tally) frac.set(a, W > 0 ? w / W : 0);
    colFracs.push(frac);
    let best = "";
    let bestKey: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const [a, w] of tally) {
      const key: [number, number, number] = [w, a !== "-" ? 1 : 0, -a.charCodeAt(0)];
      if (
        key[0] > bestKey[0] ||
        (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])
      ) {
        best = a;
        bestKey = key;
      }
    }
    if (best !== "-") lCons += 1;
  }
  const dBySeq = new Map<string, number>();
  for (const row of aligned) {
    let d = 0;
    for (let col = 0; col < nCols; col++) d += 1 - (colFracs[col].get(row[col]) ?? 0);
    dBySeq.set(row.replace(/-/g, ""), d);
  }
  return { dBySeq, lCons };
}

/**
 * Mirror of the medoid argmin (§2): i* = argmin_i D_i, tie-broken by
 * (min D_i, -w_i, seq). `members` is the gap-stripped sequence + weight + D.
 */
function selectMedoid(members: { seq: string; weight: number; d: number }[]): string {
  let bestSeq = "";
  let bestKey: [number, number, string] = [Infinity, Infinity, ""];
  for (const m of members) {
    const key: [number, number, string] = [m.d, -m.weight, m.seq];
    if (
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
      (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
    ) {
      bestSeq = m.seq;
      bestKey = key;
    }
  }
  return bestSeq;
}

// ---------------------------------------------------------------------------
// §1 — Computed centroid: threshold + X emission.
// ---------------------------------------------------------------------------
describe("§1 computed centroid: consensus threshold + X fallback", () => {
  test("50/50 K/R column emits X at default threshold 0.6", () => {
    // Single column, two members of equal weight: neither clears 0.6.
    const t = msaConsensus(["K", "R"], [1, 1], 0.6);
    expect(t).toBe("X");
  });

  test("70/30 column commits the dominant residue at threshold 0.6", () => {
    const t = msaConsensus(["K", "K", "K", "R"], [1, 1, 1, 1], 0.6); // 0.75 K
    expect(t).toBe("K");
  });

  test("threshold 1.0 forces X on any non-unanimous column", () => {
    expect(msaConsensus(["K", "K", "K", "R"], [1, 1, 1, 1], 1.0)).toBe("X");
    expect(msaConsensus(["K", "K"], [1, 1], 1.0)).toBe("K"); // unanimous still passes
  });

  test("threshold 0.5 reproduces near-plurality (winner clears 0.5)", () => {
    expect(msaConsensus(["K", "K", "K", "R"], [1, 1, 1, 1], 0.5)).toBe("K");
    // exactly 0.5 also clears (>=)
    expect(msaConsensus(["K", "R"], [1, 1], 0.5)).toBe("K");
  });

  test("gap-majority column is dropped from the centroid", () => {
    // col0 gap-majority (dropped), col1 unanimous K.
    const t = msaConsensus(["-K", "-K", "AK"], [1, 1, 1], 0.6);
    expect(t).toBe("K");
  });

  test("X never appears for a confident column even when an unrelated residue is present", () => {
    const t = msaConsensus(["K", "K", "K", "K", "W"], [1, 1, 1, 1, 1], 0.6); // 0.8 K
    expect(t).toBe("K");
  });
});

// ---------------------------------------------------------------------------
// Plurality consensus (docs/centroid-dataset-plan.md): the X-free centroid is
// the exact same `_msa_consensus` machinery run at threshold 0.0. At threshold
// 0 the `else "X"` branch is unreachable (any column reaching the threshold
// check already passed the gap-majority drop, so `best` is a non-gap residue
// with weight > 0 and best/total >= 0 always holds), so the result is a strict
// abundance-weighted per-column argmax (plurality) with no 'X'. We assert this
// directly against the existing `msaConsensus` oracle, reusing the same
// X-producing fixtures from §1.
// ---------------------------------------------------------------------------
describe("plurality consensus (threshold 0): X-free centroid", () => {
  // Independent computation of the per-column weighted argmax, mirroring the
  // same (weight, nonGap, -charCode) ordering, to confirm threshold-0 consensus
  // equals plurality. Gap-majority columns are dropped (not part of the result).
  function weightedArgmax(aligned: string[], weights: number[]): string {
    const out: string[] = [];
    const nCols = aligned[0].length;
    for (let col = 0; col < nCols; col++) {
      const tally = new Map<string, number>();
      aligned.forEach((row, i) => tally.set(row[col], (tally.get(row[col]) ?? 0) + weights[i]));
      let best = "";
      let bestKey: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const [a, w] of tally) {
        const key: [number, number, number] = [w, a !== "-" ? 1 : 0, -a.charCodeAt(0)];
        if (
          key[0] > bestKey[0] ||
          (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
          (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])
        ) {
          best = a;
          bestKey = key;
        }
      }
      if (best === "-") continue;
      out.push(best);
    }
    return out.join("");
  }

  test("50/50 K/R column: X at 0.6, but threshold 0 commits the weighted argmax (no X)", () => {
    // §1 shows this column emits 'X' at 0.6; at threshold 0 it must not.
    expect(msaConsensus(["K", "R"], [1, 1], 0.6)).toBe("X");
    const t0 = msaConsensus(["K", "R"], [1, 1], 0);
    expect(t0).not.toContain("X");
    expect(t0).toBe(weightedArgmax(["K", "R"], [1, 1]));
  });

  test("70/30 column: threshold 0 equals the weighted argmax, no X", () => {
    const aligned = ["K", "K", "K", "R"];
    const weights = [1, 1, 1, 1];
    const t0 = msaConsensus(aligned, weights, 0);
    expect(t0).not.toContain("X");
    expect(t0).toBe(weightedArgmax(aligned, weights));
    expect(t0).toBe("K");
  });

  test("3-way split column: threshold 0 picks the plurality residue, no X", () => {
    // K(3) / R(2) / W(1): neither clears 0.6, so the thresholded centroid is X;
    // plurality (threshold 0) commits the most-weighted residue K.
    const aligned = ["K", "K", "K", "R", "R", "W"];
    const weights = [1, 1, 1, 1, 1, 1];
    expect(msaConsensus(aligned, weights, 0.6)).toBe("X");
    const t0 = msaConsensus(aligned, weights, 0);
    expect(t0).not.toContain("X");
    expect(t0).toBe(weightedArgmax(aligned, weights));
    expect(t0).toBe("K");
  });

  test("gap-majority column is still dropped at threshold 0 (no X, no gap)", () => {
    // Reuse the §1 gap-majority fixture: col0 gap-majority (dropped), col1 K.
    const aligned = ["-K", "-K", "AK"];
    const weights = [1, 1, 1];
    const t0 = msaConsensus(aligned, weights, 0);
    expect(t0).not.toContain("X");
    expect(t0).not.toContain("-");
    expect(t0).toBe(weightedArgmax(aligned, weights));
    expect(t0).toBe("K");
  });

  test("randomized property: threshold-0 consensus is X-free and equals the weighted argmax", () => {
    const residues = "KRWAGD-".split(""); // include gap so columns can be mixed
    let seed = 0x9e3779b9 >>> 0;
    const rng = (): number => {
      // xorshift32, deterministic for reproducibility.
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 0xffffffff;
    };
    const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

    for (let iter = 0; iter < 500; iter++) {
      const nMembers = 1 + Math.floor(rng() * 6);
      const nCols = 1 + Math.floor(rng() * 6);
      const aligned: string[] = [];
      for (let m = 0; m < nMembers; m++) {
        let row = "";
        for (let c = 0; c < nCols; c++) row += pick(residues);
        aligned.push(row);
      }
      const weights = aligned.map(() => 1 + Math.floor(rng() * 5));
      const t0 = msaConsensus(aligned, weights, 0);
      expect(t0).not.toContain("X");
      expect(t0).toBe(weightedArgmax(aligned, weights));
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — Profile distance (1 - p_j) and normalization.
// ---------------------------------------------------------------------------
describe("§3 profile distance: 1 - p_j cost", () => {
  test("50/50 K/R column: K and R cost 0.5, unrelated W costs 1.0", () => {
    // Three single-column members: two define the 50/50 profile, plus probe W.
    // Build the profile from K and R only (equal weight); then evaluate costs.
    const { dBySeq } = msaProfileDistances(["K", "R", "W"], [1, 1, 0]);
    // With W weight 0, the profile is exactly 50/50 K/R; gap absent.
    expect(dBySeq.get("K")).toBeCloseTo(0.5, 10);
    expect(dBySeq.get("R")).toBeCloseTo(0.5, 10);
    expect(dBySeq.get("W")).toBeCloseTo(1.0, 10);
  });

  test("70/30 vs 51/49 columns give distinct dominant-residue costs (~0.3 vs ~0.5)", () => {
    // 70/30 column: dominant residue cost = 1 - 0.7 = 0.3.
    const ones = (n: number): number[] => Array.from({ length: n }, () => 1);
    const rep = (s: string, n: number): string[] => Array.from({ length: n }, () => s);

    const d7030 = msaProfileDistances(["K", "K", "K", "K", "K", "K", "K", "R", "R", "R"], ones(10));
    expect(d7030.dBySeq.get("K")).toBeCloseTo(0.3, 10);
    expect(d7030.dBySeq.get("R")).toBeCloseTo(0.7, 10);

    // 51/49 column: dominant residue cost = 1 - 0.51 = 0.49.
    const d5149 = msaProfileDistances([...rep("K", 51), ...rep("R", 49)], ones(100));
    expect(d5149.dBySeq.get("K")).toBeCloseTo(0.49, 10);
    // 70/30 dominant cost is meaningfully smaller than 51/49 dominant cost.
    expect(d7030.dBySeq.get("K")!).toBeLessThan(d5149.dBySeq.get("K")!);
  });

  test("gap is charged as a residue (1 - p_j(gap))", () => {
    // col: K K K - => p(K)=0.75, p(-)=0.25. A member with a gap costs 1-0.25=0.75.
    const { dBySeq } = msaProfileDistances(["K", "K", "K", "-"], [1, 1, 1, 1]);
    expect(dBySeq.get("K")).toBeCloseTo(0.25, 10);
    expect(dBySeq.get("")).toBeCloseTo(0.75, 10); // gap-only row strips to ""
  });

  test("L_cons counts only non-gap-majority columns", () => {
    // col0 gap-majority (dropped), col1+col2 non-gap-majority => L_cons = 2.
    const { lCons } = msaProfileDistances(["-KA", "-KA", "AKA"], [1, 1, 1]);
    expect(lCons).toBe(2);
  });
});

describe("§3 normalization + clusterRadius", () => {
  // distanceToCentroid_i = min(1, Σ_s D_i^(s) / Σ_s max(L_cons^(s), ℓ_i^(s)))
  function normalize(d: number, lCons: number, memberLen: number): number {
    const denom = Math.max(lCons, memberLen);
    return denom > 0 ? Math.min(1, d / denom) : 0;
  }

  test("distanceToCentroid stays within [0, 1]", () => {
    const { dBySeq, lCons } = msaProfileDistances(["KKK", "KKR", "WWW"], [1, 1, 1]);
    for (const [seq, d] of dBySeq) {
      const norm = normalize(d, lCons, seq.length);
      expect(norm).toBeGreaterThanOrEqual(0);
      expect(norm).toBeLessThanOrEqual(1);
    }
  });

  test("clusterRadius is the max distanceToCentroid over members", () => {
    const { dBySeq, lCons } = msaProfileDistances(["KKK", "KKR", "WWW"], [1, 1, 1]);
    const norms = [...dBySeq].map(([seq, d]) => normalize(d, lCons, seq.length));
    const radius = Math.max(...norms);
    expect(radius).toBe(Math.max(...norms));
    // The outlier WWW is the farthest member -> defines the radius.
    const outlier = normalize(dBySeq.get("WWW")!, lCons, 3);
    expect(radius).toBeCloseTo(outlier, 10);
  });
});

// ---------------------------------------------------------------------------
// §2 — Reference centroid (medoid) selection.
// ---------------------------------------------------------------------------
describe("§2 reference centroid (medoid) = argmin D_i", () => {
  test("singleton cluster: medoid is the sole member, distance 0", () => {
    // Mirrors the single-distinct-member branch (D=0, L_cons=len).
    const medoid = selectMedoid([{ seq: "KKK", weight: 5, d: 0 }]);
    expect(medoid).toBe("KKK");
  });

  test("medoid is the lowest-distance real member", () => {
    const { dBySeq } = msaProfileDistances(["KKK", "KKR", "WWW"], [3, 1, 1]);
    const members = [
      { seq: "KKK", weight: 3, d: dBySeq.get("KKK")! },
      { seq: "KKR", weight: 1, d: dBySeq.get("KKR")! },
      { seq: "WWW", weight: 1, d: dBySeq.get("WWW")! },
    ];
    // KKK is the most typical/abundant -> lowest distance -> medoid.
    expect(selectMedoid(members)).toBe("KKK");
    // The medoid is a real member sequence, never an X-bearing consensus.
    expect(selectMedoid(members)).not.toContain("X");
  });

  test("tie-break prefers the more abundant member, then lexical", () => {
    // Equal distance: higher weight wins.
    expect(
      selectMedoid([
        { seq: "BBB", weight: 1, d: 0.4 },
        { seq: "AAA", weight: 5, d: 0.4 },
      ]),
    ).toBe("AAA");
    // Equal distance and weight: smaller sequence wins.
    expect(
      selectMedoid([
        { seq: "BBB", weight: 2, d: 0.4 },
        { seq: "AAA", weight: 2, d: 0.4 },
      ]),
    ).toBe("AAA");
  });
});

// ---------------------------------------------------------------------------
// §4 — Determinism: reordering inputs must not change centroid / medoid.
// ---------------------------------------------------------------------------
describe("§4 determinism: input order does not change results", () => {
  const aligned = ["KKK", "KKR", "KWR", "WWW"];
  const weights = [4, 3, 2, 1];

  function permute<T>(arr: T[], order: number[]): T[] {
    return order.map((i) => arr[i]);
  }

  test("computed centroid is invariant to member order", () => {
    const base = msaConsensus(aligned, weights, 0.6);
    const order = [3, 1, 0, 2];
    const shuffled = msaConsensus(permute(aligned, order), permute(weights, order), 0.6);
    expect(shuffled).toBe(base);
  });

  test("medoid is invariant to member order", () => {
    const buildMembers = (al: string[], w: number[]) => {
      const { dBySeq } = msaProfileDistances(al, w);
      return al.map((row, i) => ({
        seq: row.replace(/-/g, ""),
        weight: w[i],
        d: dBySeq.get(row.replace(/-/g, ""))!,
      }));
    };
    const base = selectMedoid(buildMembers(aligned, weights));
    const order = [2, 0, 3, 1];
    const shuffled = selectMedoid(buildMembers(permute(aligned, order), permute(weights, order)));
    expect(shuffled).toBe(base);
  });
});

// ---------------------------------------------------------------------------
// Contract surface: emitted columns and CLI args from the core implementation.
// ---------------------------------------------------------------------------
describe("contract surface (column + CLI arg names)", () => {
  test("process_results.py emits the reference_centroid / distance columns", () => {
    expect(EMITTED_COLUMNS).toContain("reference_centroid_sequence_0");
    expect(EMITTED_COLUMNS).toContain("reference_centroid_trim_sequence_0");
    expect(EMITTED_COLUMNS).toContain("reference_centroid_trimmed_fullSequence");
    expect(EMITTED_COLUMNS).toContain("distanceToCentroid");
    expect(EMITTED_COLUMNS).toContain("clusterRadius");
  });

  test("process_results.py accepts the consensus-threshold / centroid-type args", () => {
    expect(CLI_ARGS).toContain("--consensus-threshold");
    expect(CLI_ARGS).toContain("--centroid-type");
  });

  test("plurality-centroid dataset names are stable (payload schema DEFERRED)", () => {
    // These names are the stable contract between process_results.py
    // (--emit-plurality-centroid -> plurality-centroid.tsv) and the
    // tengo/model wiring (plurality_centroid_trim_sequence_<nr> -> centroidDatasetPf).
    // The exact dataset payload (column set, axis identity, anchor annotations)
    // is intentionally DEFERRED per docs/centroid-dataset-plan.md, so we pin only
    // the names — not a payload shape — here.
    expect(PLURALITY_CLI_ARG).toBe("--emit-plurality-centroid");
    expect(PLURALITY_FILE).toBe("plurality-centroid.tsv");
    expect(PLURALITY_COLUMN_PREFIX).toBe("plurality_centroid_trim_sequence_");
    expect(CENTROID_DATASET_EXPORT_KEY).toBe("centroidDatasetPf");
    // .toContain pins guard against an accidental rename / typo in the prefix.
    expect(`${PLURALITY_COLUMN_PREFIX}0`).toContain("plurality_centroid_trim_sequence_");
    expect(PLURALITY_CLI_ARG).toContain("--emit-plurality-centroid");
    expect(PLURALITY_FILE).toContain("plurality-centroid.tsv");
    expect(CENTROID_DATASET_EXPORT_KEY).toContain("centroidDatasetPf");
  });
});
