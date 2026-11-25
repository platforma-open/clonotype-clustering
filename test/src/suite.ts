/*
  File-scoped harness: one backend client, one middle layer and one project per scenario.
  Every scenario in the file is a block in that project, so scenarios run concurrently on
  the backend and the per-test setup of `blockTest` is paid once.

  SDK-BOUND: `suiteTest` (the file-scoped client + middle layer fixture), project creation
  with its serialization and retry, and `KEEP_PL_ROOT` move to `@platforma-sdk/test` as
  `suiteTest` / `BlockTestSession` in milaboratory/platforma#1900. Once that releases, this
  file keeps only `Suite` (the block's memoized runs) over the SDK's `session.once`.
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

  // SDK-BOUND: becomes `BlockTestSession.project` / `createProject` in @platforma-sdk/test.
  private creating: Promise<unknown> = Promise.resolve();

  /**
   * Open a fresh project with the file's middle layer. Creations are serialized within the
   * file and retried a few times across files: every middle layer writes the same project
   * list, and under load the client exhausts its own write-transaction retries.
   */
  project(label: string): Promise<Ctx> {
    const next = this.creating.then(() => this.openProject(label));
    this.creating = next.catch(() => undefined);
    return next;
  }

  private async createProject(label: string): Promise<ML.ProjectId> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.ml.createProject({ label });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (attempt >= 4 || !/max number of attempts/.test(message)) throw e;
        const delay = 1000 + Math.random() * 2000;
        console.warn(
          `createProject(${label}) hit write contention (attempt ${attempt}); retrying in ${Math.round(delay)} ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private async openProject(label: string): Promise<Ctx> {
    const prjId = await this.createProject(label);
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

// SDK-BOUND: becomes `suiteTest` in @platforma-sdk/test (platforma#1900).
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
