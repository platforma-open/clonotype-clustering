---
"@platforma-open/milaboratories.clonotype-clustering.model": patch
"@platforma-open/milaboratories.clonotype-clustering.ui": patch
---

Fix BLOSUM matrix reverting to BLOSUM62 on app reopen or concurrent writes.

A `watch` on `app.model.args.sequencesRef` fired whenever the SDK replaced the `args` object on external-author server patches (see `createAppV2.ts` `updateAppModel`). For non-framework sequences it wrote `blosum62`, overwriting the user's explicit choice.

The auto-suggest now lives in the `PlDropdownMulti` `@update:model-value` handler, so it runs only when the user changes the selected sequence columns.

Also adds `@milaboratories/helpers` as a direct dependency of the model package to resolve a TS2742 type-portability error under the bumped SDK, matching `repertoire-distance` and `titeseq-analysis`.
