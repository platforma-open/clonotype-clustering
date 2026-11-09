import {
  BlockStorageFacadeCallbacks,
  createBlockStorage,
  stringifyJson,
} from "@platforma-sdk/model";
import { beforeAll, describe, expect, test } from "vitest";

const callbackRegistry: Record<string, (storageJson: string) => unknown> = {};

beforeAll(async () => {
  Object.assign(globalThis, { cfgRenderCtx: { callbackRegistry } });
  await import("./index");
});

const configured = {
  customBlockLabel: "",
  subtitleLabel: "CDR3 aa Heavy",
  datasetRef: { __isRef: true, blockId: "mixcr", name: "abundance" },
  sequencesRef: ["cdr3-heavy"],
  sequenceType: "aminoacid",
  identity: 0.8,
  similarityType: "blosum62",
  coverageThreshold: 0.8,
  coverageMode: 0,
  highPrecision: false,
  trimStart: 0,
  trimEnd: 0,
  clusteringTool: "easy-cluster",
  consensusThreshold: 0.6,
  gapThreshold: 0.5,
  centroidAlignment: "auto",
  weightByAbundance: false,
  generateDataset: false,
  tableState: { version: 2 },
  graphStateBubble: { title: "Most abundant clusters", template: "bubble" },
  alignmentModel: {},
  graphStateHistogram: { title: "Histogram", template: "bins" },
};

describe("args", () => {
  test("a configured block derives runnable args", () => {
    expect(deriveArgs(configured)).toMatchObject({
      value: { sequencesRef: ["cdr3-heavy"], paramsLabel: "BLOSUM62, ident:0.8, cov:0.8" },
    });
  });

  test("the subtitle label does not reach the args, so syncing it never reruns the block", () => {
    const before = deriveArgs(configured);
    const after = deriveArgs({ ...configured, subtitleLabel: "CDR3 aa Light" });
    expect(before).toHaveProperty("value.sequencesRef");
    expect(before).not.toHaveProperty("value.subtitleLabel");
    expect(after).toEqual(before);
  });
});

// Internals

function deriveArgs(data: unknown): unknown {
  const derive = callbackRegistry[BlockStorageFacadeCallbacks.ArgsDerive];
  if (derive === undefined) throw new Error("The args derive callback is not registered");
  return derive(stringifyJson(createBlockStorage(data)));
}
