---
'@platforma-open/milaboratories.clonotype-clustering.model': patch
'@platforma-open/milaboratories.clonotype-clustering.workflow': patch
'@platforma-open/milaboratories.clonotype-clustering': patch
---

Support imported antibody sets on the variantKey axis

Two tests read the record axis's name where they should have read its domain or its columns.

**Modality.** Three producers key on `pl7.app/variantKey` and only the run-id in the axis domain
separates them. A receptor set from import-vdj-data was read as peptide, so with consensus export
enabled its centroid dataset came out stamped `pl7.app/peptide/extractionRunId` — an antibody set
re-emitted as peptide, which every downstream reader then believes. The model already got this
right; the workflow and the model's `modality` output did not.

**Paired chains.** `isSingleCell` meant "the axis is `pl7.app/vdj/scClonotypeKey`". Imported
paired sets hold their chains the same way — in the `pl7.app/vdj/scClonotypeChain` column domain
— but on `pl7.app/variantKey`, so `trimStart` / `trimEnd` applied to the joined `VH====VL` string
instead of to each chain, cutting into the first chain's head and the last chain's tail only. It
now asks for a chain-domain column in both the workflow and the model. Cell barcodes and per-cell
counts are optional attributes rather than what makes data single-cell.

Clustering itself was never affected — every selected column is joined and clustered as one
string either way — and trimming defaults to `0`, so this only reached anyone who set a trim.
