/*
  Recorded outputs: every column the block exports for two scenarios, pinned under
  test/assets/recordings as file snapshots. A change to a spec, a row set or a value fails
  here with a line diff; `pnpm test -- src/recordings.test.ts -u` accepts it and the git diff
  is the review. The same folders are publishable upstream fixtures for blocks that consume
  clustering output (`recordedDataset`); the last test checks that what xsv-import publishes
  from a folder records back to what the block produced.
*/

import type { PFrameHandle } from "@platforma-sdk/model";
import {
  PFrameReader,
  RECORDED_BLOCK_ID,
  expectRecording,
  peptideDataset,
  publishXsv,
  recordColumns,
  recordedDataset,
  stableOutput,
} from "@platforma-sdk/test";
import * as fs from "node:fs";
import path from "node:path";
import { describe } from "vitest";
import { PEPTIDES } from "./fixtures";
import { defaults } from "./families";
import { XSV_IMPORT_BLOCK } from "./helpers";
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

describe("recorded outputs", () => {
  suiteTest.concurrent(
    "the defaults run exports what its recording holds",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const run = await defaults(suite);
      await expectRecording(run, {
        scenario: "defaults",
        recordingsRoot: RECORDINGS,
        producer: PRODUCER,
        blockId: run.blockId,
        expect,
      });
    },
  );

  suiteTest.concurrent(
    "the peptide run exports what its recording holds",
    { timeout: 600000 },
    async ({ suite, expect }) => {
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
        blockId: run.blockId,
        expect,
      });
    },
  );

  // Not concurrent: it runs after the snapshot tests, so under `-u` it reads the folder
  // they have finished writing.
  suiteTest(
    "the defaults recording publishes through xsv-import as the columns the block exported",
    { timeout: 600000 },
    async ({ suite, expect }) => {
      const run = await defaults(suite);
      const produced = await recordColumns(run, {
        scenario: "defaults",
        producer: PRODUCER,
        blockId: run.blockId,
      });
      const ds = await recordedDataset(path.join(RECORDINGS, "defaults"));
      const ctx = await suite.project("recording publish");
      const blockId = await publishXsv(ctx, {
        label: "Recorded clustering",
        block: XSV_IMPORT_BLOCK,
        spec: ds.spec,
        content: ds.content,
      });
      const table = await stableOutput<{ fullPframeHandle: PFrameHandle }>(
        ctx.rawPrj,
        blockId,
        "filePFrame",
        180000,
      );
      const published = await PFrameReader.local(
        ctx.ml.driverKit.pFrameDriver,
        table.fullPframeHandle,
      );
      expect(
        await recordColumns(published, {
          scenario: "defaults",
          producer: PRODUCER,
          blockId: RECORDED_BLOCK_ID,
        }),
      ).toEqual(produced);
    },
  );
});
