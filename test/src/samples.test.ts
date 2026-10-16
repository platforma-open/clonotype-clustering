/*
  Multi-sample datasets. The workflow anonymizes the sample axis before clustering and
  restores it afterwards; the per-cluster abundances are the only place that round trip is
  visible, so they are checked value by value.
*/

import { describe } from "vitest";
import { SHORT_CDR3 } from "./fixtures";
import type { Clonotype } from "./helpers";
import { vdjDataset } from "@platforma-sdk/test";
import { suiteTest } from "./suite";

// Family A appears in both samples with different expansion; family C only in S2.
const TWO_SAMPLES: Clonotype[] = [
  { sample: "S1", key: "c01", seq: "CARDYWGQGTLV", count: 120 },
  { sample: "S1", key: "c02", seq: "CARDYWGQGSLV", count: 80 },
  { sample: "S2", key: "c01", seq: "CARDYWGQGTLV", count: 10 },
  { sample: "S2", key: "c03", seq: "CARDYFGQGTLV", count: 30 },
  { sample: "S2", key: "c07", seq: "CTRGGNWFDP", count: 60 },
];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("samples", () => {
  suiteTest.concurrent(
    "per-cluster abundances come back under the original sample ids",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const dataset = suite.dataset("Two samples", vdjDataset(TWO_SAMPLES));
      const run = await suite.run("two samples", dataset, SHORT_CDR3);
      const membership = await run.membership();
      expect(await run.clusters()).toEqual([["c01", "c02", "c03"], ["c07"]]);

      const abundance = await run.read({
        name: "pl7.app/vdj/uniqueCellCount",
        axes: ["pl7.app/sampleId", "pl7.app/clusterId"],
      });
      const expected = new Map<string, number>();
      for (const r of TWO_SAMPLES) {
        const k = JSON.stringify([r.sample, membership.get(r.key)]);
        expected.set(k, (expected.get(k) ?? 0) + r.count);
      }
      expect(new Map(abundance.map((r) => [JSON.stringify(r.keys), Number(r.value)]))).toEqual(
        expected,
      );

      // Per-sample fractions sum to one within each sample.
      const fraction = await run.read({
        name: "pl7.app/readFraction",
        axes: ["pl7.app/sampleId", "pl7.app/clusterId"],
      });
      for (const sample of ["S1", "S2"]) {
        const own = fraction.filter((r) => r.keys[0] === sample).map((r) => Number(r.value));
        expect(sum(own), `fractions of ${sample}`).toBeCloseTo(1, 6);
      }

      // Totals per cluster are the sums over samples.
      const total = await run.readMap({
        name: "pl7.app/readCountTotal",
        axes: ["pl7.app/clusterId"],
      });
      for (const [cluster, t] of total) {
        const own = TWO_SAMPLES.filter((r) => membership.get(r.key) === cluster).map(
          (r) => r.count,
        );
        expect(Number(t), `total of ${cluster}`).toBe(sum(own));
      }
    },
  );
});
