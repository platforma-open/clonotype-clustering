---
"@platforma-open/milaboratories.clonotype-clustering.workflow": patch
"@platforma-open/milaboratories.clonotype-clustering": patch
---

Give the centroid dataset its own identity when the clustered dataset came from Amplicon Profiling. The centroid key axis now overrides `pl7.app/repertoire/extractionRunId` with the clustering block id, as it already did for `pl7.app/peptide/extractionRunId`. Before, the centroid axis still matched the parent dataset's axis, so the parent's columns attached to it: Sequence Properties failed to build its results table on a centroid dataset ("is not a valid canonical column id").
