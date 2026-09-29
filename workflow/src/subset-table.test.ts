import type { TplTestHelpers } from "@platforma-sdk/test";
import { awaitStableState, ML, tplTest } from "@platforma-sdk/test";
import { expect } from "vitest";

// Clonotypes k1..k3 in two samples; k1 lacks its second chain; the subset tags k1 and k3.
const label = (l: string) => ({ "pl7.app/label": l });
const sampleAxis = { name: "pl7.app/sampleId", type: "String", annotations: label("Sample") };
const keyAxis = { name: "pl7.app/vdj/clonotypeKey", type: "String", annotations: label("Clonotype") };
const peptideAxis = { name: "pl7.app/variantKey", type: "String", annotations: label("Peptide") };

const specs = {
  abundance: { kind: "PColumn", name: "pl7.app/vdj/readCount", valueType: "Int", axesSpec: [sampleAxis, keyAxis], annotations: label("Reads") },
  seq0: { kind: "PColumn", name: "pl7.app/vdj/sequence", valueType: "String", domain: { chain: "A" }, axesSpec: [keyAxis], annotations: label("Seq A") },
  seq1: { kind: "PColumn", name: "pl7.app/vdj/sequence", valueType: "String", domain: { chain: "B" }, axesSpec: [keyAxis], annotations: label("Seq B") },
  label: { kind: "PColumn", name: "pl7.app/label", valueType: "String", axesSpec: [keyAxis], annotations: label("Label") },
  tag: { kind: "PColumn", name: "pl7.app/tag", valueType: "Int", axesSpec: [keyAxis], annotations: { ...label("IgG"), "pl7.app/isSubset": "true" } },
  peptideLength: { kind: "PColumn", name: "pl7.app/sequenceLength", valueType: "Int", domain: { "pl7.app/feature": "peptide" }, axesSpec: [peptideAxis], annotations: label("Length") },
  peptideTag: { kind: "PColumn", name: "pl7.app/tag", valueType: "Int", axesSpec: [peptideAxis], annotations: { ...label("Picked"), "pl7.app/isSubset": "true" } },
};

const k = (...v: string[]) => JSON.stringify(v);
const data: Record<keyof typeof specs, { keyLength: number; data: Record<string, unknown> }> = {
  abundance: { keyLength: 2, data: { [k("s1", "k1")]: 10, [k("s1", "k2")]: 5, [k("s2", "k2")]: 3, [k("s2", "k3")]: 7 } },
  seq0: { keyLength: 1, data: { [k("k1")]: "CARDYW", [k("k2")]: "CARGGW", [k("k3")]: "CASSLW" } },
  seq1: { keyLength: 1, data: { [k("k2")]: "CQQW", [k("k3")]: "CQQY" } },
  label: { keyLength: 1, data: { [k("k1")]: "C-1", [k("k2")]: "C-2", [k("k3")]: "C-3" } },
  tag: { keyLength: 1, data: { [k("k1")]: 1, [k("k3")]: 1 } },
  // p1 (length 5) is the shortest peptide but outside the subset
  peptideLength: { keyLength: 1, data: { [k("p1")]: 5, [k("p2")]: 12, [k("p3")]: 14 } },
  peptideTag: { keyLength: 1, data: { [k("p2")]: 1, [k("p3")]: 1 } },
};

function columnInputs(tx: Parameters<Parameters<TplTestHelpers["renderTemplate"]>[3]>[0], names: (keyof typeof specs)[]) {
  const inputs: Record<string, ReturnType<typeof tx.createValue>> = {};
  for (const name of names) {
    const r = tx.createStruct({ name: "PColumnData/Json", version: "1" }, JSON.stringify(data[name]));
    tx.lockInputs(r);
    inputs[name] = r;
  }
  return inputs;
}

/** Rows of an exported TSV as trimmed lines, header first. */
async function tsvLines(
  result: Awaited<ReturnType<TplTestHelpers["renderTemplate"]>>,
  output: string,
  driverKit: ML.MiddleLayerDriverKit,
) {
  const handle = await awaitStableState(
    result.computeOutput(output, (acc, ctx) =>
      acc ? driverKit.blobDriver.getOnDemandBlob(acc.persist(), ctx).handle : undefined,
    ),
    90000,
  );
  return (await driverKit.blobDriver.getContent(handle!)).toString().trim().split("\n");
}

// Filter refs whose column id the workflow stamps as `pl7.app/subset`.
const refs = [
  { __isRef: true, blockId: "84a3733d-f4bc-4aa3-afbf-b2e32a72c9c9", name: "labels.49534f364a564a51" },
  { __isRef: true, blockId: "b", name: 'with "quotes" \\ and / slashes' },
];

tplTest("subset filter restricts both clustering input tables", { timeout: 120000 }, async ({ helper, driverKit }) => {
  const outputs = ["cloneFull", "cloneFiltered", "seqFull", "seqFiltered", "columnIds"];
  const result = await helper.renderTemplate(false, "test.subset-table.test", outputs, (tx) => ({
    specs: tx.createValue(ML.Pl.JsonObject, JSON.stringify(specs)),
    refs: tx.createValue(ML.Pl.JsonObject, JSON.stringify(refs)),
    ...columnInputs(tx, ["abundance", "seq0", "seq1", "label", "tag"]),
  }));

  // Unfiltered: every (sample, clonotype) row
  expect(await tsvLines(result, "cloneFull", driverKit)).toHaveLength(1 + 4);
  expect(await tsvLines(result, "seqFull", driverKit)).toHaveLength(1 + 3);

  // Filtered: only tagged clonotypes, headers unchanged, k1 kept despite its missing chain
  expect(await tsvLines(result, "cloneFiltered", driverKit)).toEqual([
    "sampleId\tclonotypeKey\tabundance\tsequence_0\tsequence_1\tclonotypeKeyLabel",
    "s1\tk1\t10\tCARDYW\t\tC-1",
    "s2\tk3\t7\tCASSLW\tCQQY\tC-3",
  ]);
  // The stamp must equal the model side's column id (what other blocks compare with).
  const columnIds = await awaitStableState(
    result.computeOutput("columnIds", (acc) => acc?.getDataAsJson<string[]>()),
    90000,
  );
  expect(columnIds).toEqual(
    refs.map((r) => JSON.stringify({ __isRef: true, blockId: r.blockId, name: r.name })),
  );

  expect(await tsvLines(result, "seqFiltered", driverKit)).toEqual([
    "clonotypeKey\tsequence_0\tsequence_1",
    "k1\tCARDYW\t",
    "k3\tCASSLW\tCQQY",
  ]);
});

tplTest.for([
  { filtered: false, minLength: 5 },
  { filtered: true, minLength: 12 },
])(
  "minimum peptide length (filtered: $filtered) is $minLength",
  { timeout: 120000 },
  async ({ filtered, minLength }, { helper }) => {
    const result = await helper.renderTemplate(false, "min-peptide-length", ["minLength"], (tx) => {
      const cols = columnInputs(tx, ["peptideLength", "peptideTag"]);
      return {
        spec: tx.createValue(ML.Pl.JsonObject, JSON.stringify(specs.peptideLength)),
        data: cols.peptideLength,
        ...(filtered && {
          filterSpec: tx.createValue(ML.Pl.JsonObject, JSON.stringify(specs.peptideTag)),
          filterData: cols.peptideTag,
        }),
      };
    });
    const content = await awaitStableState(
      result.computeOutput("minLength", (acc) => acc?.getDataAsString()),
      90000,
    );
    expect(JSON.parse(content!.trim().split("\n")[0]).min_len).toBe(minLength);
  },
);
