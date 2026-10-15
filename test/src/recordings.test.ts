/*
  Recorded outputs: every column the block exports for two scenarios, pinned under
  test/assets/recordings. A change to a spec, a row set or a value fails here with a
  column-level diff; `UPDATE_RECORDINGS=1 pnpm test -- src/recordings.test.ts` accepts it and
  the git diff is the review. The same folders are publishable upstream fixtures for blocks
  that consume clustering output (`recordedDataset`).
*/

import {
  expectRecording,
  peptideDataset,
  publishXsv,
  recordedDataset,
  stableOutput,
} from "@platforma-sdk/test";
import * as fs from "node:fs";
import path from "node:path";
import { describe } from "vitest";
import { PEPTIDES } from "./fixtures";
import { defaults } from "./families";
import { XSV_IMPORT_BLOCK, hasXsvImport } from "./helpers";
import { suiteTest } from "./suite";

const RECORDINGS = path.resolve(import.meta.dirname, "../assets/recordings");
const PRODUCER = {
  block: "@platforma-open/milaboratories.clonotype-clustering",
  version: (
    JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, "../../block/package.json"), "utf8"),
    ) as {
      version: string;
    }
  ).version,
};

describe.skipIf(!hasXsvImport)("recorded outputs", () => {
  suiteTest.concurrent(
    "the defaults run exports what its recording holds",
    { timeout: 600000 },
    async ({ suite }) => {
      const run = await defaults(suite);
      await expectRecording(run, {
        scenario: "defaults",
        recordingsRoot: RECORDINGS,
        producer: PRODUCER,
      });
    },
  );

  suiteTest.concurrent(
    "the peptide run exports what its recording holds",
    { timeout: 600000 },
    async ({ suite }) => {
      const run = await suite.run(
        "peptides recording",
        suite.dataset("Peptides", peptideDataset(PEPTIDES)),
        { highPrecision: true },
        { keyAxis: "pl7.app/variantKey" },
      );
      await expectRecording(run, {
        scenario: "peptides",
        recordingsRoot: RECORDINGS,
        producer: PRODUCER,
      });
    },
  );

  suiteTest.concurrent(
    "the defaults recording publishes through xsv-import as one dataset",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      // After the recording test has written or checked the folder.
      const run = await defaults(suite);
      await expectRecording(run, {
        scenario: "defaults",
        recordingsRoot: RECORDINGS,
        producer: PRODUCER,
      });
      const ds = await recordedDataset(path.join(RECORDINGS, "defaults"));
      expect(ds.recording.columns.length).toBeGreaterThan(3);
      const ctx = await suite.project("recording publish");
      const blockId = await publishXsv(ctx, {
        label: "Recorded clustering",
        block: XSV_IMPORT_BLOCK,
        spec: ds.spec,
        content: ds.content,
      });
      const table = await stableOutput<unknown>(ctx.rawPrj, blockId, "filePFrame", 180000);
      expect(table).toBeDefined();
    },
  );
});
