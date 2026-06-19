---
"@platforma-open/milaboratories.clonotype-clustering.software": patch
---

The computed centroid's "Peptide Id" in the exported centroid dataset is now a sequence-derived hash of the consensus sequence (a bare hex hash, no `P-`/`C-` prefix) instead of reusing the cluster representative's real `P-XXXX` id. Peptide ids are sequence-derived properties, so the theoretical centroid — a new sequence — gets its own id from its own sequence: the same consensus sequence always yields the same id, the id is visibly a hash (so it is not mistaken for a real peptide id), and it can no longer collide with the same Peptide Id in the original dataset.
