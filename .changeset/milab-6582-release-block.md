---
"@platforma-open/milaboratories.clonotype-clustering": patch
---

MILAB-6582: release singleton-reassignment OOM fix. The fix's original changeset (consumed in 82726a6) bumped only `.software`, which the block reaches transitively via `.workflow` (2 hops), so it never cascaded a block version bump — the block stayed at 3.2.2 and the fix went unreleased. This explicit block bump cuts a clean release (3.2.3) that ships the already-published software/workflow fix.
