---
"@platforma-open/milaboratories.clonotype-clustering.software": patch
---

Performance: each cluster's per-chain MSA is now built once and shared by the theoretical centroid, the plurality centroid, and the distance/medoid computation, instead of being re-aligned in three separate passes (up to 4× redundant kalign work per chain, worst in single-cell). Outputs are unchanged — the alignment is a pure function of the sequence set, so deriving all three from one alignment is identical to the previous separate passes (verified by differential test). When no trimming is configured, the untrimmed centroid additionally reuses the trimmed alignment rather than aligning again.
