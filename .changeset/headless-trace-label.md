---
"@platforma-open/milaboratories.clonotype-clustering.kind": minor
"@platforma-open/milaboratories.clonotype-clustering.model": patch
"@platforma-open/milaboratories.clonotype-clustering.ui": patch
"@platforma-open/milaboratories.clonotype-clustering.workflow": patch
---

Compute the block label without the UI

The trace label is now built by the workflow from the native labels of the chosen
sequence columns plus the clustering settings, so opening the block no longer changes
its arguments and a block that was never opened still gets a meaningful label. The
subtitle shows the result-pool labels of the chosen columns. The init-params contract no longer carries `defaultBlockLabel`;
templates that still contain it keep loading.
