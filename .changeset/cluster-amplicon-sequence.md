---
'@platforma-open/milaboratories.clonotype-clustering.model': patch
'@platforma-open/milaboratories.clonotype-clustering.workflow': patch
---

Support clustering `synthetic-repertoire-profiler` variant datasets:

- The variantKey-axis sequence matcher now also accepts `pl7.app/feature: "amplicon-sequence"` alongside peptide-extraction's `"peptide"`, so the profiler's sequences appear in "Sequence Columns to Cluster".
- The peptide-mode min-length computation is skipped when no `pl7.app/sequenceLength` column is present (profiler datasets don't emit one), instead of failing the workflow with a schema-validation error.
