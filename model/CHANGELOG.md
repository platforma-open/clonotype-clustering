# @platforma-open/milaboratories.clonotype-clustering.model

## 3.4.0

### Minor Changes

- 9b0830f: Add the mandatory block kind and upgrade the SDK

  The block now declares a `kind/` package carrying its identity and its
  init-params contract — the fields a project template supplies to seed a new
  instance. The model consumes them in `init` and projects the same set back out
  via `templateParams`, so export and apply are inverses. The contract covers the
  input dataset, the picked sequence columns, every clustering and centroid
  setting, the per-process memory and CPU limits, and the block labels; the table
  grid state, the two graph states and the alignment model stay out of it, being
  what the user is looking at rather than the recipe a template reproduces.

  The SDK upgrade that comes with it clears `types` from the structurer-owned test
  tsconfig, so the Python parity test pulls the node typings in by reference
  instead.

### Patch Changes

- Updated dependencies [9b0830f]
  - @platforma-open/milaboratories.clonotype-clustering.kind@1.1.0

## 3.3.0

### Minor Changes

- 11df72b: Make gap handling in the centroid consensus explicit

  The consensus centroid previously discarded an alignment column whenever gaps
  outweighed every individual residue. That was not a threshold: on a diverse
  column where each residue appears once, two gaps out of six already won, so a
  position present in 67% of members vanished from the centroid — silently, and
  with the real residues in that column. It also left `X` meaning two unrelated
  things ("residues disagree" and "most members lack this position"), and made the
  centroid length an unpredictable `alignment width − discarded columns`.

  The consensus now emits exactly one symbol per alignment column, the same
  contract as EMBOSS `cons`, Jalview's consensus row and MiXCR's contigs:

  - `-` the position is absent from most members,
  - `X` the position exists but no residue is confident enough,
  - otherwise the winning residue.

  New settings:

  - **Gap Threshold** (default 0.5, under Advanced Settings) — the weighted gap fraction a position must
    _exceed_ to count as absent. Mirrors HMMER `hmmbuild --symfrac` stated in gap
    terms (`gapThreshold = 1 - symfrac`), same default. The comparison is strict, so
    both endpoints stay usable: 1.0 keeps every column holding a residue, 0.0 treats
    any column containing a gap as absent. Separate from Consensus Threshold, which
    decides _which_ residue a position that does exist carries.

  The residue vote is now taken over the non-gap weight only. Gaps already decide
  whether the position exists, so charging them again flooded gappy-but-real columns
  with `X`. `Consensus Centroid length` is visible by default, making a divergence
  from `Reference Centroid` apparent instead of something to spot by eye.

  Centroid sequences, and therefore the `PC-XXXXX` ids derived from them, change for
  existing projects.

  Centroid sequences are always emitted as plain residue strings: `-` is not a valid
  residue for the exported dataset or for anything downstream of it. The alignment
  coordinates remain inspectable in the MSA panel, which shows the real alignment rather
  than a dashed string, and `Consensus Centroid length` surfaces any divergence from
  `Reference Centroid`. `process_results.py` keeps a `--keep-gaps` flag for running the
  script by hand; the block does not set it.

  **Alignment Model** (default `Automatic`, under Advanced Settings) selects how a cluster's
  members are laid out in columns before the vote. `Ungapped (fixed length)` forbids internal
  gaps and allows only terminal offsets — the model FaSTPACE uses for peptides and MEME for
  motifs, both on the grounds that gapped motifs cost exponential search and add noise.
  On a library where every member has the same length each offset is 0, so the centroid
  keeps the input length exactly, and the per-column mode is then provably the optimal
  median string under Hamming distance: the distance sum decomposes per position, so no
  window search or substring enumeration can improve on it. Mixed-length clusters, which
  mmseqs can produce at coverage below 1, get terminal offsets chosen against the profile
  of the heavier members.

  The contrast on a poorly-conserved cluster of six 15-mers:

  ```
  gapped     theoretical 'YSVI'            len=4    reference len=15
  ungapped   theoretical 'XXVXXXXXXXXXXXX' len=15   reference len=15
  ```

  Gapped collapses to four residues; ungapped keeps the length and reports the absent
  consensus honestly as `X`.

  `Automatic` picks `Ungapped` when the input is a peptide library **and** at least 90% of its
  sequences sit at one single length — the case where a shared position number means the same
  thing across members and indels cannot occur by design. Everything else, VDJ repertoires
  included, gets `Gapped`, since junctional indels there are real. The resolved model and the
  length distribution behind it are printed in the run log.

  Deliberately not used as evidence: how far the gapped MSA widened past the input length. It
  looks like the signal that separates "kalign inserted gaps because of real indels" from
  "kalign inserted gaps because of substitution noise", and it is not — the artefact scales
  with cluster size. On substitution-only libraries containing no indels at all:

  ```
        L    members  rate   mean excess  p90  max
       15          8  0.30          0.16    1    3
       15        128  0.30          2.68    6    8
        9        128  0.30          3.32    9   11
  ```

  while libraries built from genuinely offset motifs widen by as little as +0..+2 at four
  members. The ranges overlap, absolutely and relative to the sequence length alike, so no
  per-cluster threshold separates them. The 90% length tolerance is calibrated instead: on
  15-mers at a 0.15 substitution rate with a fraction of members carrying one deletion, the
  mean edit distance from the centroid to the true parent goes

  ```
     off-modal members    0%     12%    25%    38%    50%
     gapped               0.27   0.29   0.36   0.47   0.46
     ungapped             0.26   0.44   0.86   1.58   2.72
  ```

  so at the 12% the tolerance permits, ungapped costs ~0.15 of an edit; by 25% it has more
  than doubled the error. For what it is worth, the two models agree outright on 93–100% of
  equal-length substitution clusters across 4–128 members, so this setting rarely changes an
  answer — it decides which model is used where it does.

  `Gap Threshold` is no longer hidden for peptide inputs. It sits next to `Alignment Model`
  under Advanced Settings, which is where it belonged: on a gapped layout of peptides it is
  exactly what keeps a spurious gap column from shortening the centroid.

  How the centroid was computed is now recorded in the **column domain**, not only in the
  label, so a column produced under different settings is a different column: two blocks run
  side by side to compare settings cannot be confused for each other, and a downstream
  consumer of an exported sequence can still establish how it was derived.

  ```
  pl7.app/clustering/centroidAlignment           gapped | ungapped
  pl7.app/clustering/residueWeighting            equal | abundance
  pl7.app/clustering/gapThresholdPercent         e.g. "50"
  pl7.app/clustering/consensusThresholdPercent   e.g. "60"
  ```

  Thresholds are integer percent rather than the raw float, because a domain value has to be
  byte-stable for column identity to be stable and float formatting is not — `0.3` can render
  as `0.30000000000000004`. The consensus threshold is scoped to the thresholded centroid
  only: the medoid, the profile distance and radius, and the exported plurality centroid are
  derived at threshold 0 or straight from the profile, so tagging them with it would fragment
  their identity for a setting that cannot change their value.

  `centroidAlignment` records the setting as chosen, so on the default it reads `auto` rather
  than the model auto resolved to. Resolving it needs the sequences, which only
  `process_results.py` sees — a workflow body cannot await column data — so the concrete value
  does not exist at spec-building time. Identity stays sound anyway: the resolution is a
  deterministic function of the input data, and the input data is already part of the column's
  lineage, so two `auto` columns over the same input always agree.

  The same facts appear in prose in each column's hover description, and the auto-generated
  block label gains an `ungapped` suffix so two blocks compared side by side are
  distinguishable at a glance.

  This changes the identity of the centroid, distance and radius columns. Existing projects
  recompute, and a downstream block matching those columns on their current spec will need to
  pick them up again.

## 3.2.3

### Patch Changes

- 7ce8605: SDK Update

## 3.2.2

### Patch Changes

- 723023b: Adapt clustering to new variant (dms) data
  SDK Update

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
