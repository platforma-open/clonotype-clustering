---
"@platforma-open/milaboratories.clonotype-clustering.workflow": patch
---

The exported centroid dataset's abundance column is now marked `pl7.app/abundance/isPrimary: "false"`. This column is a per-cluster aggregate (the consensus is derived from a whole cluster), not a primary per-sequence abundance, so it must not be selectable as an input for abundance-based analyses such as clonotype-enrichment. Those blocks select inputs by the abundance triple (`isAbundance` + `abundance/normalized=false` + `abundance/isPrimary=true`); dropping `isPrimary` excludes the centroid dataset from them, while the `pl7.app/isAnchor`-based consumers (sequence-properties, antibody-sequence-liabilities, lead-selection) still detect it.
