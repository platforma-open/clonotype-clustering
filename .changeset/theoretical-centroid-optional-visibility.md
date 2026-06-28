---
"@platforma-open/milaboratories.clonotype-clustering.workflow": patch
---

The **Theoretical Centroid** sequence columns are now emitted with table visibility `optional` (present in the output PFrame and addable from the column controls, but hidden in the table by default). The **Reference Centroid** (the real, synthesizable member) stays default-visible. The theoretical centroid is still computed and still drives the distance-to-centroid / cluster-radius metrics.
