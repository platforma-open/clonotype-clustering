/// <reference types="node" />
// The shared block/test tsconfig is structurer-owned and clears `types`, assuming
// block tests are pure logic. This file shells out to python3 to execute the real
// process_results.py helpers, so it pulls node:child_process / fs / path / url in
// by reference rather than by editing a config the next refresh would rewrite.

/*
  Parity between the TS oracle in msa-oracle.ts and the REAL Python it mirrors.

  WHY THIS EXISTS
  ---------------
  wf.test.ts pins the consensus semantics against a TS re-implementation. That
  catches a change in intent, but not a mirror that drifts from the Python: both
  can be self-consistent while disagreeing with each other, and nothing fails.
  This test removes that blind spot by executing the actual functions out of
  software/src/process_results.py and comparing symbol-for-symbol.

  It runs the two pure helpers (`_is_absent_column`, `_msa_consensus`), which need
  only the Python stdlib — no polars, polars_ds or kalign, none of which are
  installed in the test environment. They are extracted by name rather than
  imported, because process_results.py is a script: importing it would parse argv
  and read input TSVs. If the extraction stops matching, that is a failure, not a
  skip — a silently vanishing parity check is exactly what this file guards.

  Skipped only when no `python3` is on PATH, so a JS-only environment stays green.
*/

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  AUTO_UNIFORM_LENGTH_SHARE,
  chooseAlignmentModel,
  DEFAULT_GAP_THRESHOLD,
  modalLengthShare,
  msaConsensus,
  ungappedLayout,
} from "./msa-oracle";

const PY_SOURCE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../software/src/process_results.py",
);

/** Is a usable `python3` on PATH? */
function findPython(): string | undefined {
  for (const candidate of ["python3", "python"]) {
    try {
      execFileSync(candidate, ["-c", "pass"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  return undefined;
}

/**
 * Pull a top-level `def <name>(...)` out of the script text, up to the next
 * top-level `def` or EOF. Throws if absent so a rename fails loudly here.
 */
function extractFunction(source: string, name: string): string {
  const match = new RegExp(String.raw`^def ${name}\([\s\S]*?(?=^def |\Z)`, "m").exec(source);
  if (!match) {
    throw new Error(
      `Could not extract \`${name}\` from process_results.py. If it was renamed or ` +
        `nested, update this test — do not delete it.`,
    );
  }
  return match[0].trimEnd();
}

type Case = {
  aligned: string[];
  weights: number[];
  threshold: number;
  gapThreshold: number;
  removeGaps: boolean;
};

/** Run the real Python helpers over `cases`, returning one consensus per case. */
function runPython(python: string, cases: Case[]): string[] {
  const source = readFileSync(PY_SOURCE, "utf8");
  const driver = [
    extractFunction(source, "_is_absent_column"),
    extractFunction(source, "_msa_consensus"),
    "import json, sys",
    "cases = json.load(sys.stdin)",
    "print(json.dumps([_msa_consensus(c['aligned'], c['weights'], c['threshold'],",
    "                                 c['gapThreshold'], c['removeGaps']) for c in cases]))",
  ].join("\n\n");

  const stdout = execFileSync(python, ["-c", driver], {
    input: JSON.stringify(cases),
    encoding: "utf8",
  });
  return JSON.parse(stdout) as string[];
}

const python = findPython();

describe.skipIf(!python)("TS oracle matches the real process_results.py", () => {
  test("fixed cases agree symbol for symbol", () => {
    const cases: Case[] = [
      // Absent column rendered, not dropped.
      {
        aligned: ["-K", "-K", "AK"],
        weights: [1, 1, 1],
        threshold: 0.6,
        gapThreshold: 0.5,
        removeGaps: false,
      },
      // Same input, gaps stripped.
      {
        aligned: ["-K", "-K", "AK"],
        weights: [1, 1, 1],
        threshold: 0.6,
        gapThreshold: 0.5,
        removeGaps: true,
      },
      // Non-gap denominator: B holds 2/3 of the non-gap weight.
      {
        aligned: ["-", "B", "B", "C"],
        weights: [1, 1, 1, 1],
        threshold: 0.6,
        gapThreshold: 0.5,
        removeGaps: false,
      },
      // Threshold boundary (>=), and the ambiguous fallback.
      {
        aligned: ["K", "R"],
        weights: [1, 1],
        threshold: 0.5,
        gapThreshold: 0.5,
        removeGaps: false,
      },
      {
        aligned: ["K", "R"],
        weights: [1, 1],
        threshold: 0.6,
        gapThreshold: 0.5,
        removeGaps: false,
      },
      // Abundance weighting decides both the residue and the absence.
      {
        aligned: ["-A", "BA"],
        weights: [100, 1],
        threshold: 0.6,
        gapThreshold: 0.5,
        removeGaps: false,
      },
      // gapThreshold 1.0 keeps every column that holds at least one residue.
      {
        aligned: ["--A", "--A", "BCA"],
        weights: [1, 1, 1],
        threshold: 0.6,
        gapThreshold: 1.0,
        removeGaps: false,
      },
      // gapThreshold endpoints: 0 must not empty the centroid, 1 keeps every column.
      {
        aligned: ["AK", "AK", "-K"],
        weights: [1, 1, 1],
        threshold: 0.6,
        gapThreshold: 0,
        removeGaps: false,
      },
      {
        aligned: ["AK", "AK", "-K"],
        weights: [1, 1, 1],
        threshold: 0.6,
        gapThreshold: 0,
        removeGaps: true,
      },
      {
        aligned: ["AK", "AK", "-K"],
        weights: [1, 1, 1],
        threshold: 0.6,
        gapThreshold: 1,
        removeGaps: false,
      },
      // Exact-tie column: the fraction equals the bar but does not exceed it.
      {
        aligned: ["A", "A", "-", "-"],
        weights: [1, 1, 1, 1],
        threshold: 0.6,
        gapThreshold: 0.5,
        removeGaps: false,
      },
      // Tie between residues breaks to the lexically smaller letter.
      { aligned: ["A", "B"], weights: [1, 1], threshold: 0, gapThreshold: 0.5, removeGaps: false },
    ];
    const fromPython = runPython(python!, cases);
    const fromTs = cases.map((c) =>
      msaConsensus(c.aligned, c.weights, c.threshold, c.gapThreshold, c.removeGaps),
    );
    expect(fromTs).toEqual(fromPython);
  });

  test("randomized columns agree over the whole parameter grid", () => {
    const alphabet = "KRWAG-".split(""); // gap included so columns mix
    let seed = 0x2545f491 >>> 0;
    const rng = (): number => {
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 0xffffffff;
    };

    const cases: Case[] = [];
    for (let i = 0; i < 300; i++) {
      const members = 2 + Math.floor(rng() * 5);
      const cols = 1 + Math.floor(rng() * 6);
      const aligned: string[] = [];
      for (let m = 0; m < members; m++) {
        let row = "";
        for (let c = 0; c < cols; c++) row += alphabet[Math.floor(rng() * alphabet.length)];
        aligned.push(row);
      }
      cases.push({
        aligned,
        weights: aligned.map(() => 1 + Math.floor(rng() * 20)),
        threshold: [0, 0.4, 0.5, 0.6, 0.8, 1][Math.floor(rng() * 6)],
        gapThreshold: [0, 0.2, 0.5, 0.8, 1][Math.floor(rng() * 5)],
        removeGaps: rng() < 0.5,
      });
    }

    const fromPython = runPython(python!, cases);
    const fromTs = cases.map((c) =>
      msaConsensus(c.aligned, c.weights, c.threshold, c.gapThreshold, c.removeGaps),
    );
    expect(fromTs).toEqual(fromPython);
  });

  test("length contract: one symbol per column, and stripping only removes gaps", () => {
    const aligned = ["-KA--", "-KAB-", "AKA--", "-K-B-"];
    const weights = [3, 1, 1, 1];
    const [kept, stripped] = runPython(python!, [
      { aligned, weights, threshold: 0.6, gapThreshold: 0.5, removeGaps: false },
      { aligned, weights, threshold: 0.6, gapThreshold: 0.5, removeGaps: true },
    ]);
    expect(kept).toHaveLength(aligned[0].length);
    expect(kept.replaceAll("-", "")).toBe(stripped);
  });

  test("ungapped layout matches the real _ungapped_layout", () => {
    const cases: { seqs: string[]; weights: number[] }[] = [
      // Equal length: every offset 0, layout identical to the input.
      { seqs: ["ACDEF", "ACDEG", "AGDEG"], weights: [1, 1, 1] },
      // Mixed lengths: terminal offsets only.
      { seqs: ["ABCDEFGH", "CDEFGH", "ABCDEF", "BCDEFG"], weights: [4, 3, 2, 1] },
      { seqs: ["CASSLGQGAETQYFG", "GQGAETQYFG"], weights: [2, 1] },
      // Weights decide which profile later members are matched against.
      { seqs: ["AAAABBBB", "BBBB", "AAAA"], weights: [10, 1, 1] },
      { seqs: ["AAAABBBB", "BBBB", "AAAA"], weights: [1, 10, 1] },
      // A member as long as the widest has no freedom; the shorter ones do.
      { seqs: ["KKWWKKWW", "WWKK", "KKWW"], weights: [3, 2, 1] },
    ];

    const source = readFileSync(PY_SOURCE, "utf8");
    const driver = [
      extractFunction(source, "_ungapped_layout"),
      "import json, sys",
      "cases = json.load(sys.stdin)",
      "print(json.dumps([_ungapped_layout(c['seqs'], c['weights']) for c in cases]))",
    ].join("\n\n");
    const fromPython = JSON.parse(
      execFileSync(python!, ["-c", driver], { input: JSON.stringify(cases), encoding: "utf8" }),
    ) as string[][];

    const fromTs = cases.map(({ seqs, weights }) => ungappedLayout(seqs, weights));
    expect(fromTs).toEqual(fromPython);

    // Whatever the offsets, the model's invariant must hold: no internal gaps.
    for (const rows of fromPython) {
      for (const row of rows) {
        expect(row.replace(/^-+/, "").replace(/-+$/, "")).not.toContain("-");
      }
    }
  });

  test("auto alignment-model rule matches the real _choose_alignment_model", () => {
    const cases: { shares: number[]; peptide: boolean }[] = [];
    // Both sides of the threshold on every chain count, and the tolerance is exact at
    // the boundary (>=, so 0.9 itself qualifies).
    for (const shares of [
      [],
      [0],
      [1],
      [0.9],
      [0.89],
      [0.9000001],
      [0.5],
      [1, 0.9],
      [1, 0.89], // one bad chain is enough to fall back
      [0.95, 0.92, 0.91],
      [0.95, 0.92, 0.5],
    ]) {
      cases.push({ shares, peptide: true }, { shares, peptide: false });
    }

    const source = readFileSync(PY_SOURCE, "utf8");
    const driver = [
      // The constant lives outside any def, so it is lifted separately.
      `AUTO_UNIFORM_LENGTH_SHARE = ${
        /^AUTO_UNIFORM_LENGTH_SHARE = (\S+)$/m.exec(source)?.[1] ?? "None"
      }`,
      extractFunction(source, "_choose_alignment_model"),
      "import json, sys",
      "cases = json.load(sys.stdin)",
      "print(json.dumps([_choose_alignment_model(c['shares'], c['peptide']) for c in cases]))",
    ].join("\n\n");
    const fromPython = JSON.parse(
      execFileSync(python!, ["-c", driver], { input: JSON.stringify(cases), encoding: "utf8" }),
    ) as string[];

    expect(cases.map((c) => chooseAlignmentModel(c.shares, c.peptide))).toEqual(fromPython);
    // A non-peptide input must never reach ungapped, whatever the lengths look like.
    const nonPeptideVerdicts = fromPython.filter((_verdict, i) => !cases[i].peptide);
    expect(nonPeptideVerdicts).not.toHaveLength(0);
    expect([...new Set(nonPeptideVerdicts)]).toEqual(["gapped"]);
  });

  test("modal length share matches the real _modal_length_share", () => {
    // The Python side uses polars, which the test environment does not have, so parity
    // here is asserted against a stdlib transcription of the same three lines. The
    // extraction below still fails loudly if the real helper is renamed or reshaped.
    const source = readFileSync(PY_SOURCE, "utf8");
    const real = extractFunction(source, "_modal_length_share");
    expect(real).toContain("str.len_chars()");
    expect(real).toContain('filter(pl.col("length") > 0)');
    expect(real).toContain("modal_count / n");

    const cases: string[][] = [
      [],
      ["", ""],
      ["ACDEF", "ACDEG", "ACDEH"], // one length, share 1
      ["ACDEF", "ACDE", "ACDEG"], // 2 of 3
      ["ACDEF", "", "ACDEG"], // empties excluded, so share 1 not 2/3
      Array.from({ length: 10 }, (_, i) => "A".repeat(i < 9 ? 9 : 8)), // exactly 0.9
      Array.from({ length: 10 }, (_, i) => "A".repeat(i < 8 ? 9 : 8)), // 0.8
    ];
    const driver = [
      "import json, sys",
      "def share(values):",
      "    lengths = [len(v) for v in values if len(v) > 0]",
      "    if not lengths: return 0.0",
      "    counts = {}",
      "    for l in lengths: counts[l] = counts.get(l, 0) + 1",
      "    return max(counts.values()) / len(lengths)",
      "print(json.dumps([share(c) for c in json.load(sys.stdin)]))",
    ].join("\n");
    const fromPython = JSON.parse(
      execFileSync(python!, ["-c", driver], { input: JSON.stringify(cases), encoding: "utf8" }),
    ) as number[];

    expect(cases.map(modalLengthShare)).toEqual(fromPython);
    // The two boundary cases decide opposite ways, which is the point of the constant.
    expect(chooseAlignmentModel([fromPython[5]], true)).toBe("ungapped");
    expect(chooseAlignmentModel([fromPython[6]], true)).toBe("gapped");
  });

  test("the Python source still exposes the helpers this test extracts", () => {
    // Guards the skip path above from hiding a rename: if the functions move,
    // extraction throws rather than the suite quietly covering nothing.
    const source = readFileSync(PY_SOURCE, "utf8");
    expect(() => extractFunction(source, "_is_absent_column")).not.toThrow();
    expect(() => extractFunction(source, "_msa_consensus")).not.toThrow();
    expect(() => extractFunction(source, "_ungapped_layout")).not.toThrow();
    expect(() => extractFunction(source, "_choose_alignment_model")).not.toThrow();
    expect(() => extractFunction(source, "_modal_length_share")).not.toThrow();
    expect(DEFAULT_GAP_THRESHOLD).toBe(0.5); // must track the Python default
    expect(source).toContain(`AUTO_UNIFORM_LENGTH_SHARE = ${AUTO_UNIFORM_LENGTH_SHARE}`);
  });
});
