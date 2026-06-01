---
"@platforma-open/milaboratories.clonotype-clustering.model": patch
---

MILAB-6318: read `isEmpty`, `minPeptideLength`, and `clusterAbundanceSpec` via `getDataAsString` instead of `getDataAsJson`. `getDataAsJson` throws "Resource has no content." when a field is resolved but its blob is not yet fetched, flashing a transient block error during calculation on remote backends.
