/*
  Known defects, written as the behaviour the block should have and marked `fails`: each
  passes while the defect exists and fails once it is fixed, so a fix cannot land without
  flipping the test into a plain one.

  This PR adds tests only. The fixes come in a separate PR after these tests are merged;
  that PR flips each `suiteTest.fails` below to `suiteTest`.

  Evidence for the first two is in the landscape README (section 12.1): mmseqs2 1.19.0's
  linclust kmermatcher segfaults on every platform when no input sequence is as long as the
  k-mer length it picks (14 at identity >= 0.9, at least 10 below), and the block's default
  path and peptide guard both run linclust.
*/

import { peptideDataset, stableOutput } from "@platforma-sdk/test";
import { describe } from "vitest";
import { PEPTIDES, THREE_FAMILY_PARTITION } from "./fixtures";
import { families, refines } from "./families";
import { suiteTest } from "./suite";

describe("known defects", () => {
  suiteTest.fails(
    "the default path clusters a CDR3-length library at identity 0.9",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      // Crashes today: every CDR3 here is 10 to 12 aa, below linclust's k of 14.
      // Fix (separate PR): --single-step-clustering on the default path for short libraries.
      const run = await suite.run("default identity 0.9", families(suite), { identity: 0.9 });
      expect(refines(await run.clusters(), THREE_FAMILY_PARTITION)).toBe(true);
    },
  );

  suiteTest.fails(
    "the default path clusters a 9-mer peptide library",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      // Crashes today: the peptide guard's -k never reaches kmermatcher, which picks k >= 10.
      // Fix (separate PR): the same --single-step-clustering guard, keyed on the longest peptide.
      const run = await suite.run(
        "default 9-mers",
        suite.dataset("Peptides", peptideDataset(PEPTIDES)),
        {},
        { keyAxis: "pl7.app/variantKey" },
      );
      expect(
        refines(await run.clusters(), [
          ["p1", "p2", "p3"],
          ["p4", "p5"],
        ]),
      ).toBe(true);
    },
  );

  suiteTest.fails(
    "centroidDatasetPf is written as an output, not only exported",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      // Empty today: with a peptide library and "Generate dataset" on, the workflow builds
      // the centroid dataset and exports it to the pool, but never sets the output the model
      // declares, so the model resolves it as absent. Fix (separate PR): write it to outputs
      // as well. High precision keeps the 9-mers off the crashing default path above.
      const run = await suite.run(
        "centroid dataset output",
        suite.dataset("Peptides", peptideDataset(PEPTIDES)),
        { highPrecision: true, generateDataset: true },
        { keyAxis: "pl7.app/variantKey" },
      );
      expect(await stableOutput<boolean>(run.ctx.rawPrj, run.blockId, "isPeptide", 180000)).toBe(
        true,
      );
      const state = await run.ctx.rawPrj.getBlockState(run.blockId).getValue();
      const output = (state.outputs as Record<string, { ok: boolean; value?: unknown }>)
        .centroidDatasetPf;
      expect(output?.ok).toBe(true);
      expect(output?.value).toBeDefined();
    },
  );
});
