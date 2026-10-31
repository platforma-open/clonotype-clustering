# Vendored Proof-of-Concept Helpers

Verbatim copies of files from the `@platforma-sdk/test` proposal (milaboratory/platforma#1900),
kept here only until that SDK change is released. Each file's header says what it is and how
to remove it. Do not extend these files; fix in the SDK PR and copy back.

| File                | SDK source                                                  | Used by              |
| ------------------- | ----------------------------------------------------------- | -------------------- |
| `model-harness.ts`  | `sdk/test/src/model-harness.ts`                             | `model.test.ts`      |
| `dataset-shapes.ts` | `sdk/test/src/fixtures/xsv-spec.ts` + `fixtures/dataset.ts` | `recording.ts`       |
| `recording.ts`      | `sdk/test/src/recording.ts`                                 | `recordings.test.ts` |
