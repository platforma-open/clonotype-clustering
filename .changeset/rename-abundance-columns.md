---
'@platforma-open/milaboratories.clonotype-clustering.workflow': minor
---

Rename per-sample fraction (`abundance_normalized`) to `pl7.app/vdj/readFraction` and per-cluster aggregates to `pl7.app/vdj/readCountTotal` / `pl7.app/vdj/readFractionTotal`, mirroring the naming convention used by `mixcr-clonotyping`. Without the per-sample fraction rename the column collided with its absolute-count sibling under PColumn identity (`kind+name+domain+axes`) and was silently deduped before reaching consumers — "Fraction Of Reads in Cluster" never appeared in Graph Maker's Y picker. The same renames apply to the UMI variant.
