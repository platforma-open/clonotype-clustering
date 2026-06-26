---
"@platforma-open/milaboratories.clonotype-clustering": minor
"@platforma-open/milaboratories.clonotype-clustering.workflow": minor
"@platforma-open/milaboratories.clonotype-clustering.software": minor
---

Add a **Residue Weighting** option to the Centroid settings, controlling how each clonotype counts when voting on the consensus residue at every alignment column (and in the profile distance / Reference Centroid measured against it):

- **Equal weight** (default) — every clonotype counts once, so the centroid reflects the cluster's sequence set regardless of clonal expansion. Column ties break deterministically (non-gap over gap, then alphabetically).
- **By abundance** — each clonotype's vote is weighted by its summed abundance, so expanded clones dominate (the previous behaviour).
