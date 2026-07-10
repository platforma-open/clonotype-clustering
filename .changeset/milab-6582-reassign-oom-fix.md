---
"@platforma-open/milaboratories.clonotype-clustering.software": patch
---

MILAB-6582: fix singleton reassignment crash on large repertoires. High-precision
mode's reassignment cross-joined every singleton with every non-singleton centroid,
materializing n_singletons × n_centroids rows and overflowing polars' 2^32 row limit
(`ComputeError: cross joins would produce more rows than fits into 2^32`).

Replaced the all-pairs cross join with a per-centroid length-band prefilter +
bounded `filter_by_levenshtein` + exact recheck, keeping only a running
best-per-singleton (periodic reduction). Peak memory is now O(#singletons)
regardless of match density, and no cross join is built. The reassignment result
(closest centroid, then largest cluster) is identical to before, covered by the
added reassignment regression tests.
