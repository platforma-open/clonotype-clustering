---
'@platforma-open/milaboratories.clonotype-clustering.model': patch
'@platforma-open/milaboratories.clonotype-clustering.workflow': patch
'@platforma-open/milaboratories.clonotype-clustering.ui': patch
'@platforma-open/milaboratories.clonotype-clustering': patch
---

Add per-sample cluster abundance (count and within-sample fraction) to the main clusters table, one column per sample, hidden by default. The table is now built with `createPlDataTableV3`. Fix the descriptions of the per-sample cluster abundance columns: they are sums over the cluster's clonotypes, not per-clonotype values.
