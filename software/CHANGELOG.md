# @platforma-open/milaboratories.clonotype-clustering.software

## 4.2.0

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

## 4.1.3

### Patch Changes

- bc725ae: Release software

## 4.1.2

### Patch Changes

- d67bd8d: Export sequence length for the consensus centroid dataset so downstream peptide blocks accept it as input.

## 4.1.1

### Patch Changes

- dc0aa67: MILAB-6582: fix singleton reassignment crash on large repertoires. High-precision
  mode's reassignment cross-joined every singleton with every non-singleton centroid,
  materializing n_singletons × n_centroids rows and overflowing polars' 2^32 row limit
  (`ComputeError: cross joins would produce more rows than fits into 2^32`).

  Replaced the all-pairs cross join with a per-centroid length-band prefilter +
  bounded `filter_by_levenshtein` + exact recheck, keeping only a running
  best-per-singleton (periodic reduction). Peak memory is now O(#singletons)
  regardless of match density, and no cross join is built. The reassignment result
  (closest centroid, then largest cluster) is identical to before, covered by the
  added reassignment regression tests.

## 4.1.0

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

- cc6958d: The computed centroid's "Peptide Id" in the exported centroid dataset is now a human-readable, sequence-derived id of the form `PC-XXXXX` (Peptide Consensus). The body follows the exact same logic and form as a real peptide id — peptide-extraction's algorithm (`sha256` → base64-alphanumeric → drop digits → first 5 letters → uppercase) applied to the centroid's own consensus sequence — so users can recognize and track it across blocks and projects. The `PC-` prefix marks it as the theoretical centroid and keeps it distinct from the real `P-XXXXX` ids in the original dataset. Five-letter-body collisions are disambiguated with a `-N` tie-break exactly like the peptide-label pipeline.
- ab47ea4: Performance: each cluster's per-chain MSA is now built once and shared by the theoretical centroid, the plurality centroid, and the distance/medoid computation, instead of being re-aligned in three separate passes (up to 4× redundant kalign work per chain, worst in single-cell). Outputs are unchanged — the alignment is a pure function of the sequence set, so deriving all three from one alignment is identical to the previous separate passes (verified by differential test). When no trimming is configured, the untrimmed centroid additionally reuses the trimmed alignment rather than aligning again.

## 4.0.1

### Patch Changes

- 138e9af: Migrate block onto the structurer (block-tools 2.10.19) — full SDK upgrade: model/ui-vue 1.79.6, workflow-tengo 6.6.1, tengo-builder 4.0.8, test 1.79.10. Adopts the canonical tool-managed layout (oxlint/oxfmt, tsconfig, turbo, block index, managed package.json + catalog).

## 4.0.0

### Major Changes

- 0be1c80: Support peptides

## 3.11.2

### Patch Changes

- 5242e98: Make high precision clustering optional depending on clustering sequence

## 3.11.1

### Patch Changes

- 21bb46a: Improve clustering heuristics by adjusting mmseq parameters and adding post processing step to reassign singleton sequences

## 3.11.0

### Minor Changes

- 836e038: Deduplication and migration to latest layout

## 3.10.0

### Minor Changes

- b6a187e: Abundance fraction per cluster column added

## 3.9.8

### Patch Changes

- 96aa1ed: refactor for deduplication
- ff8ac39: refactor for deduplication
- 938e2f0: Refactor code for deduplication

## 3.9.7

### Patch Changes

- 74ab1cf: Fix polars version

## 3.9.6

### Patch Changes

- 13758de: technical release
- 008f95c: technical release
- b8c8bc3: technical release
- bffa615: technical release

## 3.9.5

### Patch Changes

- 2065c11: [blocks] no message about unsupported OS

## 3.9.4

### Patch Changes

- 666689a: technical release

## 3.9.3

### Patch Changes

- c0bb670: technical release

## 3.9.2

### Patch Changes

- b85a5c7: Update python

## 3.9.1

### Patch Changes

- 823ff69: Full SDK update

## 3.9.0

### Minor Changes

- c722cfb: Included input sequence trimming option for clustering

## 3.8.2

### Patch Changes

- 7092f34: Updated SDK to support polars.

## 3.8.1

### Patch Changes

- 829a9ab: Update python package versions

## 3.8.0

### Minor Changes

- cc86997: Deal with empty inputs

## 3.7.0

### Minor Changes

- ac0d0e0: Add cluster radius metric and export
- 469d0b6: Limited bubble plot to top 100 clusters. Fixed centroid export annotations.

## 3.6.2

### Patch Changes

- 060366d: Bug fix in mmseqs2 processing

## 3.6.1

### Patch Changes

- 15ffee5: SDK Upgrade, excessive CPU usage fix

## 3.6.0

### Minor Changes

- 10de058: Updated distance to centroid calculation to account for multiple region sequences

## 3.5.1

### Patch Changes

- d3cd2c1: SDK and Python Env Upgade

## 3.5.0

### Minor Changes

- 0e2c545: Added distance from each clonotype to cluster centroid

## 3.4.0

### Minor Changes

- 33ea3aa: Allow separate input for heavy and light

## 3.3.0

### Minor Changes

- f7cf11a: Allow multiple region clustering

## 3.2.2

### Patch Changes

- 3e98e66: Fix exports

## 3.2.1

### Patch Changes

- 9647842: Adjust labels

## 3.2.0

### Minor Changes

- f121dfa: Add abundance per cluster to export

## 3.1.0

### Minor Changes

- fb91da8: Calculate abundance automatically; Add ability to specify sequence/

## 3.0.0

### Major Changes

- 717e08e: Switched to mmseqs2

### Minor Changes

- ef2564b: Refactoring

## 2.0.0

### Major Changes

- d299403: Compatible only with new MiXCR and scFv versions
