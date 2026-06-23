---
"@platforma-open/milaboratories.clonotype-clustering.model": patch
---

MILAB-6318: fix a transient "Some outputs have errors" banner that flashed during calculation on remote backends. `inputState`, `minPeptideLength`, and `clusterAbundanceSpec` now read via `getDataAsJsonOrUndefined`, which returns `undefined` while a field is resolved-but-not-yet-fetched instead of throwing like `getDataAsJson`.
