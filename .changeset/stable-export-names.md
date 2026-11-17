---
"@platforma-open/milaboratories.clonotype-clustering.workflow": patch
"@platforma-open/milaboratories.clonotype-clustering": patch
---

Exported columns keep the same name in every run. The names carry the column's position (`pf.abundance0`), and the position came from the order Tengo walks a map in, which is random: the abundance column was `pf.abundance0` in one run and `pf.abundance1` in another. A block below that had saved the name, or a project made from a template, then failed with "Anchor 'main' is not unmarshalled … BResolveSingleNoResult". The columns are now walked by sorted key, so the abundance column is always `pf.abundance0`.
