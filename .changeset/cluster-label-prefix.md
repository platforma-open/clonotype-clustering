---
'@platforma-open/milaboratories.clonotype-clustering.software': patch
'@platforma-open/milaboratories.clonotype-clustering.workflow': patch
'@platforma-open/milaboratories.clonotype-clustering': patch
---

Prefix cluster labels that carry no recognised record prefix

A cluster is labelled from its representative record's label, with a leading `C-` (MiXCR) or `P-`
(peptide) rewritten to `CL-`. An imported set's labels are the scientist's own identifiers —
`AB-001`, `trastuzumab` — so nothing was rewritten and the cluster appeared under a bare record
name, reading as a record rather than a cluster.

Such labels now get `CL-` prepended: `AB-001` becomes `CL-AB-001`. MiXCR and peptide labels are
unchanged.

A label already shaped like `CL-01` is prepended too, giving `CL-CL-01`. An imported set's labels
are arbitrary, so `CL-01` is a record the scientist named that way; leaving it alone would show a
cluster and a record under one identical string — the confusion this change exists to remove.
