# @platforma-open/milaboratories.clonotype-clustering

## 3.2.3

### Patch Changes

- bfe9840: MILAB-6582: release singleton-reassignment OOM fix. The fix's original changeset (consumed in 82726a6) bumped only `.software`, which the block reaches transitively via `.workflow` (2 hops), so it never cascaded a block version bump — the block stayed at 3.2.2 and the fix went unreleased. This explicit block bump cuts a clean release (3.2.3) that ships the already-published software/workflow fix.

## 3.2.2

### Patch Changes

- 723023b: Adapt clustering to new variant (dms) data
  SDK Update

## 3.2.1

### Patch Changes

- Updated dependencies [681f901]
  - @platforma-open/milaboratories.clonotype-clustering.model@3.2.1
  - @platforma-open/milaboratories.clonotype-clustering.workflow@4.2.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@4.2.1

## 3.2.0

### Minor Changes

- ab47ea4: Cluster centroid confidence and distance are now computed from the abundance-weighted multiple sequence alignment (MSA) profile rather than by Levenshtein comparison against a single centroid string:

  - **Profile distance (1−p)** — `distanceToCentroid` and `clusterRadius` are derived from the kalign MSA: each column contributes a cost of `1 − p_j(residue)` (where `p_j(a)` is the abundance fraction of residue `a` in column `j`, gaps included) for every aligned member. The per-member distance is the sum over chains of these costs, normalized and clamped to `[0, 1]`. This replaces the previous representative-string Levenshtein metric and is measured against the theoretical (consensus) centroid.
  - **Reference centroid (medoid)** — a new `reference_centroid_sequence_0`, `reference_centroid_trim_sequence_0`, and `reference_centroid_trimmed_fullSequence` set of columns expose the real cluster member with minimum total profile distance (the medoid). These are always emitted and kept as a reference.
  - **Longer-sequence normalization** — per-member distance is normalized by `max(L_cons, ℓ_i)` per chain (the consensus non-gap-majority length versus the member's own non-gap length), so longer members are not unfairly penalized.
  - **Missing chains (single-cell)** — a chain dropout is a sequencing artifact rather than biology, so a member lacking a chain is no longer penalized: the missing chain is dropped from both the numerator and the denominator, leaving its absence neutral to the distance. To avoid an incomplete clone being chosen as the reference, the medoid / reference centroid is now selected only among members that carry every chain the cluster actually has (falling back to all members only if none is complete).
  - **Deterministic ordering** — members are sorted by `(−weight, sequence)` before the MSA member cap and the kalign feed, making the kept set, the consensus, the medoid, and the radius stable run-to-run.
  - **Consensus threshold** — the existing `--consensus-threshold` argument (default 0.6) controls when a column emits `X` instead of a majority residue in the computed consensus.

- 137afb4: Add a **Residue Weighting** option to the Centroid settings, controlling how each clonotype counts when voting on the consensus residue at every alignment column (and in the profile distance / Reference Centroid measured against it):

  - **Equal weight** (default) — every clonotype counts once, so the centroid reflects the cluster's sequence set regardless of clonal expansion. Column ties break deterministically (non-gap over gap, then alphabetically).
  - **By abundance** — each clonotype's vote is weighted by its summed abundance, so expanded clones dominate (the previous behaviour).

- ab47ea4: Each cluster now exposes two centroid sequence columns, both always computed (no user selection):

  - **Theoretical Centroid** — a per-chain consensus built by aligning the cluster's distinct members with kalign (multiple sequence alignment) and taking the abundance-weighted per-column majority residue, so it need not match any observed member. Distance-to-centroid and cluster radius are measured against this theoretical centroid.
  - **Reference Centroid** — the medoid: the real member sequence closest to the cluster profile ("closest to centroid"), kept purely as a reference.

  The **Consensus Threshold** setting controls the minimum abundance-weighted fraction a residue must reach in an alignment column for the theoretical centroid to emit it (otherwise "X"). Both centroid columns keep the original sequence spec, so downstream blocks consume them unchanged.

- ab47ea4: A new **Generate centroid dataset** checkbox (off by default) additionally exports a downstream dataset of per-cluster centroid sequences:

  - Each centroid is the abundance-weighted per-column majority residue of the cluster's MSA (plurality consensus, threshold 0), so it contains no `X` and need not match any observed member.
  - The dataset is surfaced as a separately-addressable export, selectable as a downstream input dataset.
  - It carries a linker column connecting the centroid axis to the cluster axis, so a downstream block can follow it to every cluster property the consensus derives from (abundance, radius, distance, theoretical/reference centroids).
  - The block's own input dataset picker excludes this exported centroid dataset, so it cannot be selected as the clustering input of the same block.
  - The feature is computed only when the box is checked, so the extra alignment pass is skipped when it is off.

### Patch Changes

- ab47ea4: The **Generate centroid dataset** feature is now restricted to peptide inputs:

  - The exported centroid dataset is produced only when the input is a peptide dataset (axis `pl7.app/variantKey`); it is skipped for antibody/TCR (VDJ) inputs even if the box was checked.
  - The **Generate centroid dataset** checkbox is hidden unless the input modality is peptide.
  - The exported dataset is keyed on the standard peptide clonotype axis `pl7.app/variantKey` (inheriting the parent dataset's domain, including `pl7.app/peptide/extractionRunId`) and separated from the parent by the clustering content tag already on the cluster axis. Downstream peptide blocks (sequence-properties, antibody-sequence-liabilities, antibody-tcr-lead-selection) therefore detect it as a peptide dataset by axis name with no special-casing — no dedicated centroid axis is introduced.
  - The exported dataset now mirrors a real peptide dataset's shape (a `pl7.app/variantKey` axis plus a `Peptide Id` label column) so downstream blocks treat it identically to a selected dataset.

- Updated dependencies [ceac7b2]
- Updated dependencies [ab47ea4]
- Updated dependencies [ab47ea4]
- Updated dependencies [137afb4]
- Updated dependencies [843b05b]
- Updated dependencies [ab47ea4]
- Updated dependencies [ab47ea4]
- Updated dependencies [137afb4]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@4.2.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@4.2.0
  - @platforma-open/milaboratories.clonotype-clustering.model@3.2.0

## 3.1.3

### Patch Changes

- Updated dependencies [e1e1b32]
  - @platforma-open/milaboratories.clonotype-clustering.model@3.1.2
  - @platforma-open/milaboratories.clonotype-clustering.ui@4.1.2

## 3.1.2

### Patch Changes

- 138e9af: Migrate block onto the structurer (block-tools 2.10.19) — full SDK upgrade: model/ui-vue 1.79.6, workflow-tengo 6.6.1, tengo-builder 4.0.8, test 1.79.10. Adopts the canonical tool-managed layout (oxlint/oxfmt, tsconfig, turbo, block index, managed package.json + catalog).
- Updated dependencies [138e9af]
  - @platforma-open/milaboratories.clonotype-clustering.model@3.1.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@4.1.1
  - @platforma-open/milaboratories.clonotype-clustering.workflow@4.1.1

## 3.1.1

### Patch Changes

- 9688057: Update dependencies and workspace configuration

## 3.1.0

### Minor Changes

- 058d322: Adapt to short peptides
- 0642e10: Adapt to short peptides

### Patch Changes

- Updated dependencies [058d322]
- Updated dependencies [0642e10]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@4.1.0
  - @platforma-open/milaboratories.clonotype-clustering.model@3.1.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@4.1.0

## 3.0.5

### Patch Changes

- ef85b2f: Set clustering block order

## 3.0.4

### Patch Changes

- fdb4061: Update SDK
- Updated dependencies [fdb4061]
- Updated dependencies [f446d40]
  - @platforma-open/milaboratories.clonotype-clustering.model@3.0.2
  - @platforma-open/milaboratories.clonotype-clustering.ui@4.0.3

## 3.0.3

### Patch Changes

- Updated dependencies [7c5abe0]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@4.0.1

## 3.0.2

### Patch Changes

- Updated dependencies [8e4b279]
  - @platforma-open/milaboratories.clonotype-clustering.model@3.0.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@4.0.2

## 3.0.1

### Patch Changes

- 3d96459: Universalize tooltips
- Updated dependencies [3d96459]
  - @platforma-open/milaboratories.clonotype-clustering.ui@4.0.1

## 3.0.0

### Major Changes

- 0be1c80: Support peptides

### Patch Changes

- Updated dependencies [0be1c80]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@4.0.0
  - @platforma-open/milaboratories.clonotype-clustering.model@3.0.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@4.0.0

## 2.7.17

### Patch Changes

- Updated dependencies [80abf64]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.28.0

## 2.7.16

### Patch Changes

- Updated dependencies [20a0069]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.16.2
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.14.3

## 2.7.15

### Patch Changes

- Updated dependencies [225bfce]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.27.1

## 2.7.14

### Patch Changes

- Updated dependencies [49dcfec]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.27.0

## 2.7.13

### Patch Changes

- Updated dependencies [12fbc72]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.14.2

## 2.7.12

### Patch Changes

- Updated dependencies [0d34b13]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.16.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.14.1

## 2.7.11

### Patch Changes

- Updated dependencies [1789fc2]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.26.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.16.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.14.0

## 2.7.10

### Patch Changes

- Updated dependencies [692ebdf]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.25.4

## 2.7.9

### Patch Changes

- Updated dependencies [de2362d]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.25.3
  - @platforma-open/milaboratories.clonotype-clustering.model@2.15.4
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.13.7

## 2.7.8

### Patch Changes

- Updated dependencies [5242e98]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.25.2
  - @platforma-open/milaboratories.clonotype-clustering.model@2.15.3
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.13.6

## 2.7.7

### Patch Changes

- Updated dependencies [21bb46a]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.15.2
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.13.5
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.25.1

## 2.7.6

### Patch Changes

- Updated dependencies [dd451d1]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.15.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.13.4

## 2.7.5

### Patch Changes

- Updated dependencies [deb333e]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.13.3

## 2.7.4

### Patch Changes

- Updated dependencies [8811443]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.13.2

## 2.7.3

### Patch Changes

- Updated dependencies [10c8e0f]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.13.1

## 2.7.2

### Patch Changes

- 09a440a: Remove sequence trace

## 2.7.1

### Patch Changes

- 0c16288: Adjust trace priority

## 2.7.0

### Minor Changes

- c56955f: Added support for running state and labels

### Patch Changes

- Updated dependencies [c56955f]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.25.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.15.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.13.0

## 2.6.2

### Patch Changes

- 28a4098: fix incorrect table headers
- Updated dependencies [28a4098]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.14.2
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.12.2

## 2.6.1

### Patch Changes

- fdec994: Use BLOSUM Alignment score by default
- Updated dependencies [fdec994]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.14.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.12.1

## 2.6.0

### Minor Changes

- 836e038: Deduplication and migration to latest layout

### Patch Changes

- Updated dependencies [836e038]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.24.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.14.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.12.0

## 2.5.15

### Patch Changes

- Updated dependencies [b6a187e]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.23.0

## 2.5.14

### Patch Changes

- Updated dependencies [9835e4a]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.22.5

## 2.5.13

### Patch Changes

- e652be3: Update SDK

## 2.5.12

### Patch Changes

- Updated dependencies [96aa1ed]
- Updated dependencies [ff8ac39]
- Updated dependencies [938e2f0]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.22.4
  - @platforma-open/milaboratories.clonotype-clustering.model@2.13.6
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.11.8

## 2.5.11

### Patch Changes

- 8af1a18: Block metadata updated.

## 2.5.10

### Patch Changes

- Updated dependencies [ef7d568]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.22.3

## 2.5.9

### Patch Changes

- Updated dependencies [247d501]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.11.7

## 2.5.8

### Patch Changes

- f228ca1: update SDK

## 2.5.7

### Patch Changes

- Updated dependencies [c2f4dea]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.11.6

## 2.5.6

### Patch Changes

- @platforma-open/milaboratories.clonotype-clustering.workflow@3.22.2

## 2.5.5

### Patch Changes

- Updated dependencies [8f3a04e]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.22.1

## 2.5.4

### Patch Changes

- Updated dependencies [17b1920]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.22.0

## 2.5.3

### Patch Changes

- 13758de: technical release
- 008f95c: technical release
- b8c8bc3: technical release
- bffa615: technical release
- Updated dependencies [13758de]
- Updated dependencies [008f95c]
- Updated dependencies [b8c8bc3]
- Updated dependencies [bffa615]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.13.5
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.11.5
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.21.6

## 2.5.2

### Patch Changes

- 2065c11: [blocks] no message about unsupported OS
- Updated dependencies [2065c11]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.13.4
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.11.4
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.21.5

## 2.5.1

### Patch Changes

- 666689a: technical release
- Updated dependencies [666689a]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.13.3
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.11.3
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.21.4

## 2.5.0

### Minor Changes

- d1ae791: Update dependencies

## 2.4.17

### Patch Changes

- c0bb670: technical release
- Updated dependencies [c0bb670]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.13.2
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.11.2
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.21.3

## 2.4.16

### Patch Changes

- @platforma-open/milaboratories.clonotype-clustering.workflow@3.21.2

## 2.4.15

### Patch Changes

- c7f0a1c: os limitations

## 2.4.14

### Patch Changes

- Updated dependencies [823ff69]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.13.1
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.21.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.11.1

## 2.4.13

### Patch Changes

- Updated dependencies [45969f6]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.21.0

## 2.4.12

### Patch Changes

- Updated dependencies [c722cfb]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.20.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.13.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.11.0

## 2.4.11

### Patch Changes

- Updated dependencies [d689179]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.10.5

## 2.4.10

### Patch Changes

- 7092f34: Updated SDK to support polars.
- Updated dependencies [7092f34]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.12.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.10.4
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.19.2

## 2.4.9

### Patch Changes

- Updated dependencies [ba0abb1]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.12.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.10.3

## 2.4.8

### Patch Changes

- Updated dependencies [7c4541c]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.10.2

## 2.4.7

### Patch Changes

- @platforma-open/milaboratories.clonotype-clustering.workflow@3.19.1

## 2.4.6

### Patch Changes

- Updated dependencies [afa7944]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.10.1

## 2.4.5

### Patch Changes

- Updated dependencies [6a8a756]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.19.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.11.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.10.0

## 2.4.4

### Patch Changes

- Updated dependencies [cc86997]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.18.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.10.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.9.0

## 2.4.3

### Patch Changes

- Updated dependencies [ac0d0e0]
- Updated dependencies [469d0b6]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.17.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.9.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.8.0

## 2.4.2

### Patch Changes

- Updated dependencies [8bfffe9]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.16.0

## 2.4.1

### Patch Changes

- Updated dependencies [ed6141c]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.15.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.8.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.7.0

## 2.4.0

### Minor Changes

- ab7d0d5: allow prepare venv on Windows

## 2.3.4

### Patch Changes

- Updated dependencies [091bc1c]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.7.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.6.1

## 2.3.3

### Patch Changes

- Updated dependencies [565a46a]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.14.0

## 2.3.2

### Patch Changes

- Updated dependencies [7ebded3]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.13.0

## 2.3.1

### Patch Changes

- Updated dependencies [08fa82f]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.12.0

## 2.3.0

### Minor Changes

- bbf758f: Update workflow-tengo

## 2.2.2

### Patch Changes

- Updated dependencies [1bcfe85]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.11.0

## 2.2.1

### Patch Changes

- 259125b: chore: fix version

## 2.2.0

### Minor Changes

- 9de5d19: chore: revert for MSA

## 2.1.9

### Patch Changes

- Updated dependencies [5ed8b53]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.10.0

## 2.1.8

### Patch Changes

- @platforma-open/milaboratories.clonotype-clustering.workflow@3.9.3

## 2.1.7

### Patch Changes

- Updated dependencies [e4317b5]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.7.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.6.0

## 2.1.6

### Patch Changes

- 15ffee5: SDK Upgrade, excessive CPU usage fix
- Updated dependencies [15ffee5]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.6.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.5.1
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.9.2

## 2.1.5

### Patch Changes

- @platforma-open/milaboratories.clonotype-clustering.workflow@3.9.1

## 2.1.4

### Patch Changes

- Updated dependencies [d536272]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.9.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.6.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.5.0

## 2.1.3

### Patch Changes

- d3cd2c1: SDK and Python Env Upgade
- Updated dependencies [d3cd2c1]
  - @platforma-open/milaboratories.clonotype-clustering.model@2.5.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.4.1
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.8.1

## 2.1.2

### Patch Changes

- Updated dependencies [0e2c545]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.8.0

## 2.1.1

### Patch Changes

- Updated dependencies [d5a09ff]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.7.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.5.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.4.0

## 2.1.0

### Minor Changes

- 33ea3aa: Allow separate input for heavy and light

### Patch Changes

- Updated dependencies [33ea3aa]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.6.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.4.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.3.0

## 2.0.9

### Patch Changes

- Updated dependencies [f7cf11a]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.5.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.3.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.2.0

## 2.0.8

### Patch Changes

- Updated dependencies [3e98e66]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.4.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.1.4

## 2.0.7

### Patch Changes

- Updated dependencies [317ac08]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.4.0

## 2.0.6

### Patch Changes

- Updated dependencies [9647842]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.3.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.1.3

## 2.0.5

### Patch Changes

- Updated dependencies [74545ab]
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.1.2

## 2.0.4

### Patch Changes

- Updated dependencies [f121dfa]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.3.0

## 2.0.3

### Patch Changes

- Updated dependencies [9a8e64d]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.2.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.2.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.1.1

## 2.0.2

### Patch Changes

- Updated dependencies [fb91da8]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.1.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.1.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.1.0

## 2.0.1

### Patch Changes

- Updated dependencies [d1f13ee]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.0.1
  - @platforma-open/milaboratories.clonotype-clustering.model@2.0.1
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.0.1

## 2.0.0

### Major Changes

- 717e08e: Switched to mmseqs2

### Patch Changes

- Updated dependencies [ef2564b]
- Updated dependencies [717e08e]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@3.0.0
  - @platforma-open/milaboratories.clonotype-clustering.model@2.0.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@3.0.0

## 1.2.0

### Minor Changes

- 0eea3f6: Package updates

## 1.1.4

### Patch Changes

- Updated dependencies [d299403]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@2.0.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@2.0.0

## 1.1.3

### Patch Changes

- Updated dependencies [e94a414]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@1.3.0

## 1.1.2

### Patch Changes

- Updated dependencies [ed9c62b]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@1.2.1

## 1.1.1

### Patch Changes

- Updated dependencies [3e1260c]
  - @platforma-open/milaboratories.clonotype-clustering.workflow@1.2.0

## 1.1.0

### Minor Changes

- 6a05554: MVA

### Patch Changes

- Updated dependencies [6a05554]
  - @platforma-open/milaboratories.clonotype-clustering.model@1.1.0
  - @platforma-open/milaboratories.clonotype-clustering.ui@1.1.0
  - @platforma-open/milaboratories.clonotype-clustering.workflow@1.1.0
