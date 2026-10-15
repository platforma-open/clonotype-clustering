/*
  Backend-free checks of the model: what the block sends the workflow, what it projects to a
  template, and what a fresh block starts with. Everything here is a pure function of block
  data, so it runs in milliseconds and without a backend.
*/

import { createPlRef } from "@platforma-sdk/model";
import { BlockModelHarness, VDJ_CDR3_ID } from "@platforma-sdk/test";
import { beforeAll, describe, expect, test } from "vitest";
import type { BlockData } from "this-block";

type Args = { datasetRef: unknown; sequencesRef: unknown[]; identity: number };

let model: BlockModelHarness<BlockData, Args>;
beforeAll(async () => {
  model = await BlockModelHarness.load<BlockData, Args>(() => import("this-block"));
});

const ref = createPlRef("upstream", "outputPf.cellCount");

describe("model", () => {
  test("a fresh block starts at identity 0.8 with nothing selected", () => {
    const data = model.initialData();
    expect(data.identity).toBe(0.8);
    expect(data.datasetRef).toBeUndefined();
    expect(data.sequencesRef).toEqual([]);
  });

  test("args need a dataset and at least one sequence column", () => {
    const data = model.initialData();
    expect(() => model.args(data)).toThrow(/Dataset is required/);
    expect(() => model.args({ ...data, datasetRef: ref })).toThrow(/Sequences are required/);
  });

  test("args carry the selections and the tuning the workflow reads", () => {
    const data = {
      ...model.initialData(),
      datasetRef: ref,
      sequencesRef: [VDJ_CDR3_ID],
      identity: 0.9,
    };
    const args = model.args(data);
    expect(args.datasetRef).toEqual(ref);
    expect(args.sequencesRef).toEqual([VDJ_CDR3_ID]);
    expect(args.identity).toBe(0.9);
  });

  test("template params round-trip through a fresh block", () => {
    const data = {
      ...model.initialData(),
      datasetRef: ref,
      sequencesRef: [VDJ_CDR3_ID],
      identity: 0.7,
    };
    const params = model.templateParams(data);
    const restored = model.dataFromParams(params, { upstream: "upstream" });
    expect(restored.datasetRef).toEqual(ref);
    expect(restored.sequencesRef).toEqual([VDJ_CDR3_ID]);
    expect(restored.identity).toBe(0.7);
  });

  test("sections render from data alone", () => {
    const sections = model.sections({ data: model.initialData() });
    expect(sections.length).toBeGreaterThan(0);
  });

  test("an output that reads the pool refuses to render here", () => {
    expect(() => model.render("datasetOptions", { data: model.initialData() })).toThrow(
      /needs a rendered project/,
    );
  });
});
