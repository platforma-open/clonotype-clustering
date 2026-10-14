/*
  File-scoped harness: one backend client, one middle layer and one project per test file.
  Every scenario in the file is a block in that project, so scenarios run concurrently on
  the backend and the per-test setup of `blockTest` is paid once.

  The middle layer refreshes staging every 500 ms here (the default is 2 s), which is the
  wait behind every option-discovery step.
*/

import { registerServiceCapabilities } from "@platforma-sdk/model";
import { ML } from "@platforma-sdk/test";
import { randomUUID } from "node:crypto";
import * as fsp from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";
import type { Ctx, RunOptions } from "./helpers";
import type { Run } from "./helpers";
import { VDJ_CDR3_ID, publishTsv, runClustering } from "./helpers";

const KEEP = process.env.KEEP_PL_ROOT === "1";

/** A dataset to publish: rows already rendered to TSV plus the xsv-import spec. */
export type Dataset = {
  key: string;
  tsv: string;
  spec: unknown;
  sequenceId?: string;
  filterColumn?: string;
};

/**
 * One file's worth of runs, memoized by key so tests can share them. Every run gets its own
 * project (publisher block plus one clustering block): blocks in one project share a tree,
 * and each change re-renders every block's outputs, so many blocks per project is slower
 * than many small projects. Projects share the file's client and middle layer.
 */
export class Suite {
  private readonly runs = new Map<string, Promise<Run>>();

  constructor(
    readonly ml: ML.MiddleLayer,
    readonly tmpFolder: string,
  ) {}

  /** A VDJ-shaped dataset: anchor `cellCount`, CDR3 column wired by its canonical id. */
  dataset(
    key: string,
    tsv: string,
    spec: unknown,
    sequenceId: string = VDJ_CDR3_ID,
    filterColumn?: string,
  ): Dataset {
    return { key, tsv, spec, sequenceId, filterColumn };
  }

  /** Open a fresh project with the file's middle layer. */
  async project(label: string): Promise<Ctx> {
    const prjId = await this.ml.createProject({ label });
    await this.ml.openProject(prjId);
    const rawPrj = this.ml.getOpenedProject(prjId);
    const helpers = {
      getLocalFileHandle: (p: string) =>
        this.ml.internalDriverKit.lsDriver.getLocalFileHandle(path.resolve(p)),
    };
    return { rawPrj, ml: this.ml, helpers, tmpFolder: this.tmpFolder };
  }

  /** Run clustering over `dataset` once per file under `key`, in a project of its own. */
  run(
    key: string,
    dataset: Dataset,
    patch: Record<string, unknown> = {},
    opts: RunOptions = {},
  ): Promise<Run> {
    let p = this.runs.get(key);
    if (p === undefined) {
      p = (async () => {
        const ctx = await this.project(key);
        const blockId = await publishTsv(ctx, dataset.key, dataset.tsv, dataset.spec);
        const direct =
          dataset.sequenceId === undefined
            ? {}
            : {
                direct: {
                  anchorColumn: "cellCount",
                  sequenceId: dataset.sequenceId,
                  filterColumn: dataset.filterColumn,
                },
              };
        return await runClustering(ctx, patch, { ...opts, ...direct, datasetBlockId: blockId });
      })();
      this.runs.set(key, p);
    }
    return p;
  }
}

export const suiteTest = test.extend<{ suite: Suite }>({
  suite: [
    // vitest requires the destructuring form even for a file-scoped fixture with no deps.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const workFolder = path.resolve(`work/${randomUUID()}`);
      await fsp.mkdir(path.join(workFolder, "frontend"), { recursive: true });
      await fsp.mkdir(path.join(workFolder, "download"), { recursive: true });

      const alternativeRoot = `test_${Date.now()}_${randomUUID()}`;
      const pl = await ML.TestHelpers.getTestClient(alternativeRoot);
      let ml: ML.MiddleLayer | undefined;
      try {
        ml = await ML.MiddleLayer.init(pl, workFolder, {
          defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
          projectRefreshInterval: 2000,
          devBlockUpdateRecheckInterval: 300,
          localSecret: ML.MiddleLayer.generateLocalSecret(),
          localProjections: [],
          openFileDialogCallback: () => {
            throw new Error("Not implemented.");
          },
        });
        for (const v of [1, 2, 3]) ml.addRuntimeCapability("requiresUIAPIVersion", v);
        registerServiceCapabilities((flag, value) => ml!.addRuntimeCapability(flag, value));

        await use(new Suite(ml, workFolder));
      } finally {
        await ml?.close();
        await pl.close();
        if (KEEP) {
          console.log(
            `KEEP_PL_ROOT: alternative root ${alternativeRoot}, work folder ${workFolder}`,
          );
        } else {
          const cleanup = await ML.TestHelpers.getTestClient();
          try {
            await cleanup.deleteAlternativeRoot(alternativeRoot);
          } finally {
            await cleanup.close();
          }
          await fsp.rm(workFolder, { recursive: true, maxRetries: 3, retryDelay: 100 });
        }
      }
    },
    { scope: "file" },
  ],
});
