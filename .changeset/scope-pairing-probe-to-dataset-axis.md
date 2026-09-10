---
"@platforma-open/milaboratories.clonotype-clustering.model": patch
"@platforma-open/milaboratories.clonotype-clustering": patch
---

Fix an empty "Sequence column" dropdown for bulk datasets. The probe that decides whether a
dataset is paired searched the whole result pool for a `pl7.app/vdj/sequence` column with
`pl7.app/vdj/scClonotypeChain/index: "primary"`. In a project that also contains a single-cell
block, the probe matched that block's columns and marked every bulk dataset as paired. The
paired matcher then found no sequence column on the bulk `clonotypeKey` axis, so
`sequenceOptions` was empty and Run stayed disabled. The `isSingleCell` output was wrong in the
same projects. The pairing probe and the scFv probe are now scoped to the dataset's clonotype
axis, in the same way as the matchers that follow them.
