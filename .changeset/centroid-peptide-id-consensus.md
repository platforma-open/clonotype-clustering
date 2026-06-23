---
"@platforma-open/milaboratories.clonotype-clustering.software": patch
---

The computed centroid's "Peptide Id" in the exported centroid dataset is now a human-readable, sequence-derived id of the form `PC-XXXXX` (Peptide Consensus). The body follows the exact same logic and form as a real peptide id — peptide-extraction's algorithm (`sha256` → base64-alphanumeric → drop digits → first 5 letters → uppercase) applied to the centroid's own consensus sequence — so users can recognize and track it across blocks and projects. The `PC-` prefix marks it as the theoretical centroid and keeps it distinct from the real `P-XXXXX` ids in the original dataset. Five-letter-body collisions are disambiguated with a `-N` tie-break exactly like the peptide-label pipeline.
