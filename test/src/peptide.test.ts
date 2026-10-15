/*
  Peptide input (variantKey axis stamped with a peptide extraction run). The block detects
  the modality, sizes its mmseqs2 tuning from the library's shortest peptide, applies
  trimming before clustering, and stamps its settings into the exported specs.

  The peptide guard and the `centroidDatasetPf` output are known defects, pinned as expected
  failures in known-defects.test.ts.
*/

import { describe } from "vitest";
import type { Clonotype } from "./helpers";
import { peptideDataset, stableOutput } from "@platforma-sdk/test";
import { PEPTIDES } from "./fixtures";
import { hasXsvImport, sequencesByCluster } from "./helpers";
import { suiteTest } from "./suite";

// q1 and q2 differ at position 2 only. Dropping the first two residues makes them
// identical, so they merge at an identity no untrimmed pair can reach.
const TRIM_PAIR: Clonotype[] = [
  { key: "q1", seq: "SIINFEKLA", count: 5 },
  { key: "q2", seq: "SAINFEKLA", count: 5 },
  { key: "q3", seq: "GILGFVFTL", count: 5 },
];

const PEPTIDE = { keyAxis: "pl7.app/variantKey" };
const SHORT = { highPrecision: true };

describe.skipIf(!hasXsvImport)("peptide input", () => {
  suiteTest.concurrent(
    "detects the peptide modality, clusters the library and stamps its settings",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const dataset = suite.dataset("Peptides", peptideDataset(PEPTIDES));
      const run = await suite.run("peptides", dataset, SHORT, PEPTIDE);
      const { rawPrj } = run.ctx;

      expect(await stableOutput<boolean>(rawPrj, run.blockId, "isPeptide", 180000)).toBe(true);
      expect(await stableOutput<number>(rawPrj, run.blockId, "minPeptideLength", 180000)).toBe(9);

      expect(await run.clusters()).toEqual([
        ["p1", "p2", "p3"],
        ["p4", "p5"],
      ]);

      const membership = await run.membership();
      const computed = await run.centroids("centroid");
      expect(computed.get(membership.get("p1")!)).toBe("SIINFEKLA");
      expect(computed.get(membership.get("p4")!)).toBe("GILGFVFXL");

      const members = sequencesByCluster(PEPTIDES, membership);
      for (const [cluster, seq] of await run.centroids("referenceCentroid")) {
        expect(members.get(cluster), `reference centroid of ${cluster}`).toContain(seq);
      }

      // Provenance: the settings a centroid was computed under live in its domain, so two
      // runs with different settings are different columns. Thresholds as integer percent.
      const centroid = run.findColumn({
        name: "pl7.app/sequence",
        axes: ["pl7.app/clusterId"],
        domain: { "pl7.app/clustering/sequenceContent": "centroid" },
      });
      expect(centroid.spec.domain).toMatchObject({
        "pl7.app/feature": "peptide",
        "pl7.app/alphabet": "aminoacid",
        "pl7.app/clustering/centroidAlignment": "auto",
        "pl7.app/clustering/consensusThresholdPercent": "60",
        "pl7.app/clustering/gapThresholdPercent": "50",
        "pl7.app/clustering/residueWeighting": "equal",
      });
    },
  );

  suiteTest.concurrent(
    "trimStart removes the leading residues before similarity is judged",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const dataset = suite.dataset("Trim pair", peptideDataset(TRIM_PAIR));
      const run = await suite.run(
        "trimmed",
        dataset,
        { ...SHORT, identity: 0.99, trimStart: 2 },
        PEPTIDE,
      );
      expect(await run.clusters()).toEqual([["q1", "q2"], ["q3"]]);
    },
  );

  suiteTest.concurrent(
    "without trimming the same pair stays apart at identity 0.99",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const dataset = suite.dataset("Trim pair", peptideDataset(TRIM_PAIR));
      const run = await suite.run("untrimmed", dataset, { ...SHORT, identity: 0.99 }, PEPTIDE);
      expect(await run.clusters()).toEqual([["q1"], ["q2"], ["q3"]]);
    },
  );
});
