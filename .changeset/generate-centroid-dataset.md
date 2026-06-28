---
"@platforma-open/milaboratories.clonotype-clustering": minor
"@platforma-open/milaboratories.clonotype-clustering.workflow": minor
"@platforma-open/milaboratories.clonotype-clustering.software": minor
---

A new **Generate centroid dataset** checkbox (off by default) additionally exports a downstream dataset of per-cluster centroid sequences:

- Each centroid is the abundance-weighted per-column majority residue of the cluster's MSA (plurality consensus, threshold 0), so it contains no `X` and need not match any observed member.
- The dataset is surfaced as a separately-addressable export, selectable as a downstream input dataset.
- It carries a linker column connecting the centroid axis to the cluster axis, so a downstream block can follow it to every cluster property the consensus derives from (abundance, radius, distance, theoretical/reference centroids).
- The block's own input dataset picker excludes this exported centroid dataset, so it cannot be selected as the clustering input of the same block.
- The feature is computed only when the box is checked, so the extra alignment pass is skipped when it is off.
