---
"@platforma-open/milaboratories.clonotype-clustering.workflow": minor
"@platforma-open/milaboratories.clonotype-clustering.software": minor
"@platforma-open/milaboratories.clonotype-clustering": minor
---

For peptide inputs, the block exports the residue frequencies of every cluster (`pl7.app/clustering/residueFrequency`, axes cluster × chain × position × residue, values 0–1, gap rows kept), so a sequence logo can be drawn per cluster. The frequencies come from the per-column vote the block already runs to build each cluster's consensus, with the same abundance weighting, so no extra alignment is run. Non-peptide inputs get no new column. graph-maker is updated to 1.10.7.
