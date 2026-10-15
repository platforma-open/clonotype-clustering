/*
  File-scoped harness over the SDK's `suiteTest`: one backend client and middle layer per
  test file, one project per scenario, scenarios memoized by key so tests can share them.
*/

import type { BlockTestSession, SyntheticDataset } from "@platforma-sdk/test";
import { suiteTest as sessionTest } from "@platforma-sdk/test";
import type { Ctx, Run, RunOptions } from "./helpers";
import { publishDataset, runClustering } from "./helpers";

/** A dataset to publish, named so runs over it can be memoized. */
export type Dataset = SyntheticDataset & { key: string };

/**
 * One file's worth of runs, memoized by key so tests can share them. Every run gets its own
 * project (publisher block plus one clustering block): blocks in one project share a tree,
 * and each change re-renders every block's outputs, so many blocks per project is slower
 * than many small projects. Projects share the file's client and middle layer.
 */
export class Suite {
  private readonly runs = new Map<string, Promise<Run>>();

  constructor(readonly session: BlockTestSession) {}

  dataset(key: string, dataset: SyntheticDataset): Dataset {
    return { key, ...dataset };
  }

  /** Open a fresh project with the file's middle layer. */
  project(label: string): Promise<Ctx> {
    return this.session.project(label);
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
        if (dataset.sequenceId === undefined)
          throw new Error(`Dataset ${dataset.key} has no single sequence column to cluster`);
        const blockId = await publishDataset(ctx, dataset.key, dataset);
        return await runClustering(ctx, patch, {
          ...opts,
          direct: {
            anchorColumn: dataset.anchorColumn,
            sequenceId: dataset.sequenceId,
            filterColumn: dataset.filterColumn,
          },
          datasetBlockId: blockId,
        });
      })();
      this.runs.set(key, p);
    }
    return p;
  }
}

export const suiteTest = sessionTest.extend<{ suite: Suite }>({
  suite: [
    async ({ session }, use) => {
      await use(new Suite(session));
    },
    { scope: "file" },
  ],
});
