---
"@platforma-open/milaboratories.clonotype-clustering": minor
"@platforma-open/milaboratories.clonotype-clustering.workflow": minor
"@platforma-open/milaboratories.clonotype-clustering.software": minor
---

Each cluster now exposes two centroid sequence columns, both always computed (no user selection):

- **Theoretical Centroid** — a per-chain consensus built by aligning the cluster's distinct members with kalign (multiple sequence alignment) and taking the abundance-weighted per-column majority residue, so it need not match any observed member. Distance-to-centroid and cluster radius are measured against this theoretical centroid.
- **Reference Centroid** — the medoid: the real member sequence closest to the cluster profile ("closest to centroid"), kept purely as a reference.

The **Consensus Threshold** setting controls the minimum abundance-weighted fraction a residue must reach in an alignment column for the theoretical centroid to emit it (otherwise "X"). Both centroid columns keep the original sequence spec, so downstream blocks consume them unchanged.
