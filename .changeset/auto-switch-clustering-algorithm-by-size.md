---
'@platforma-open/milaboratories.clonotype-clustering.model': patch
'@platforma-open/milaboratories.clonotype-clustering.ui': patch
---

Auto-select the clustering algorithm by dataset size: when the selected dataset exceeds the row threshold, switch to linear-time easy-linclust; otherwise use easy-cluster. The model exposes the selected dataset's row count (via getNumberOfRows) as the `datasetSize` output, and the UI applies the algorithm switch reactively.