# @platforma-open/milaboratories.clonotype-clustering.model

## 3.2.1

### Patch Changes

- 681f901: Support clustering `synthetic-repertoire-profiler` variant datasets:

  - The variantKey-axis sequence matcher now also accepts `pl7.app/feature: "amplicon-sequence"` alongside peptide-extraction's `"peptide"`, so the profiler's sequences appear in "Sequence Columns to Cluster".
  - The peptide-mode min-length computation is skipped when no `pl7.app/sequenceLength` column is present (profiler datasets don't emit one), instead of failing the workflow with a schema-validation error.

## 3.2.0

### Minor Changes

- ab47ea4: Cluster centroid confidence and distance are now computed from the abundance-weighted multiple sequence alignment (MSA) profile rather than by Levenshtein comparison against a single centroid string:

  - **Profile distance (1−p)** — `distanceToCentroid` and `clusterRadius` are derived from the kalign MSA: each column contributes a cost of `1 − p_j(residue)` (where `p_j(a)` is the abundance fraction of residue `a` in column `j`, gaps included) for every aligned member. The per-member distance is the sum over chains of these costs, normalized and clamped to `[0, 1]`. This replaces the previous representative-string Levenshtein metric and is measured against the theoretical (consensus) centroid.
  - **Reference centroid (medoid)** — a new `reference_centroid_sequence_0`, `reference_centroid_trim_sequence_0`, and `reference_centroid_trimmed_fullSequence` set of columns expose the real cluster member with minimum total profile distance (the medoid). These are always emitted and kept as a reference.
  - **Longer-sequence normalization** — per-member distance is normalized by `max(L_cons, ℓ_i)` per chain (the consensus non-gap-majority length versus the member's own non-gap length), so longer members are not unfairly penalized.
  - **Missing chains (single-cell)** — a chain dropout is a sequencing artifact rather than biology, so a member lacking a chain is no longer penalized: the missing chain is dropped from both the numerator and the denominator, leaving its absence neutral to the distance. To avoid an incomplete clone being chosen as the reference, the medoid / reference centroid is now selected only among members that carry every chain the cluster actually has (falling back to all members only if none is complete).
  - **Deterministic ordering** — members are sorted by `(−weight, sequence)` before the MSA member cap and the kalign feed, making the kept set, the consensus, the medoid, and the radius stable run-to-run.
  - **Consensus threshold** — the existing `--consensus-threshold` argument (default 0.6) controls when a column emits `X` instead of a majority residue in the computed consensus.

## 3.1.2

### Patch Changes

- e1e1b32: MILAB-6318: fix a transient "Some outputs have errors" banner that flashed during calculation on remote backends. `inputState`, `minPeptideLength`, and `clusterAbundanceSpec` now read via `getDataAsJsonOrUndefined`, which returns `undefined` while a field is resolved-but-not-yet-fetched instead of throwing like `getDataAsJson`.

## 3.1.1

### Patch Changes

- 138e9af: Migrate block onto the structurer (block-tools 2.10.19) — full SDK upgrade: model/ui-vue 1.79.6, workflow-tengo 6.6.1, tengo-builder 4.0.8, test 1.79.10. Adopts the canonical tool-managed layout (oxlint/oxfmt, tsconfig, turbo, block index, managed package.json + catalog).

## 3.1.0

### Minor Changes

- 058d322: Adapt to short peptides
- 0642e10: Adapt to short peptides

## 3.0.2

### Patch Changes

- fdb4061: Update SDK
- f446d40: update dependencies

## 3.0.1

### Patch Changes

- 8e4b279: migrate to model v3, turn on table export

## 3.0.0

### Major Changes

- 0be1c80: Support peptides

## 2.16.2

### Patch Changes

- 20a0069: Fix BLOSUM matrix reverting to BLOSUM62 on app reopen or concurrent writes.

  A `watch` on `app.model.args.sequencesRef` fired whenever the SDK replaced the `args` object on external-author server patches (see `createAppV2.ts` `updateAppModel`). For non-framework sequences it wrote `blosum62`, overwriting the user's explicit choice.

  The auto-suggest now lives in the `PlDropdownMulti` `@update:model-value` handler, so it runs only when the user changes the selected sequence columns.

  Also adds `@milaboratories/helpers` as a direct dependency of the model package to resolve a TS2742 type-portability error under the bumped SDK, matching `repertoire-distance` and `titeseq-analysis`.

## 2.16.1

### Patch Changes

- 0d34b13: Do not enable "high precision" mode by default

## 2.16.0

### Minor Changes

- 1789fc2: Support easy-linclust for large datasets

## 2.15.4

### Patch Changes

- de2362d: Support different BLOSUM matrices

## 2.15.3

### Patch Changes

- 5242e98: Make high precision clustering optional depending on clustering sequence

## 2.15.2

### Patch Changes

- 21bb46a: Improve clustering heuristics by adjusting mmseq parameters and adding post processing step to reassign singleton sequences

## 2.15.1

### Patch Changes

- dd451d1: Default block label derivation improvements

## 2.15.0

### Minor Changes

- c56955f: Added support for running state and labels

## 2.14.2

### Patch Changes

- 28a4098: fix incorrect table headers

## 2.14.1

### Patch Changes

- fdec994: Use BLOSUM Alignment score by default

## 2.14.0

### Minor Changes

- 836e038: Deduplication and migration to latest layout

## 2.13.6

### Patch Changes

- ff8ac39: refactor for deduplication

## 2.13.5

### Patch Changes

- 13758de: technical release
- 008f95c: technical release
- b8c8bc3: technical release
- bffa615: technical release

## 2.13.4

### Patch Changes

- 2065c11: [blocks] no message about unsupported OS

## 2.13.3

### Patch Changes

- 666689a: technical release

## 2.13.2

### Patch Changes

- c0bb670: technical release

## 2.13.1

### Patch Changes

- 823ff69: Full SDK update

## 2.13.0

### Minor Changes

- c722cfb: Included input sequence trimming option for clustering

## 2.12.1

### Patch Changes

- 7092f34: Updated SDK to support polars.

## 2.12.0

### Minor Changes

- ba0abb1: scfv construct support

## 2.11.0

### Minor Changes

- 6a8a756: Add mmseq logs button

## 2.10.0

### Minor Changes

- cc86997: Deal with empty inputs

## 2.9.0

### Minor Changes

- 469d0b6: Limited bubble plot to top 100 clusters. Fixed centroid export annotations.

## 2.8.0

### Minor Changes

- ed6141c: Update SDK & custom mem & cpu limits

## 2.7.1

### Patch Changes

- 091bc1c: Migrate to use new PlAgDataTableV2

## 2.7.0

### Minor Changes

- e4317b5: Add cluster size histogram, remove advanced settings panel and fix plot defaults picking up data from previous block if there is another clonotype-clustering block.

## 2.6.1

### Patch Changes

- 15ffee5: SDK Upgrade, excessive CPU usage fix

## 2.6.0

### Minor Changes

- d536272: MSA for clusters

## 2.5.1

### Patch Changes

- d3cd2c1: SDK and Python Env Upgade

## 2.5.0

### Minor Changes

- d5a09ff: Expose clustering options

## 2.4.0

### Minor Changes

- 33ea3aa: Allow separate input for heavy and light

## 2.3.0

### Minor Changes

- f7cf11a: Allow multiple region clustering

## 2.2.0

### Minor Changes

- 9a8e64d: Fix for bulk data

## 2.1.0

### Minor Changes

- fb91da8: Calculate abundance automatically; Add ability to specify sequence/

## 2.0.1

### Patch Changes

- d1f13ee: Migrate to PlAgDataTableV2 and small fixes

## 2.0.0

### Major Changes

- 717e08e: Switched to mmseqs2

### Minor Changes

- ef2564b: Refactoring

## 1.1.0

### Minor Changes

- 6a05554: MVA
