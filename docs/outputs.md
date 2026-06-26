# Outputs

`inputKey` is the per-row key carried by the input dataset — `clonotypeKey` for VDJ inputs, `variantKey` for peptide inputs.

Each cluster exposes a single per-chain **centroid** sequence (`sequenceContent="centroid"`, label `Centroid …`) on the `clusterId` axis, reusing the input sequence spec so it is a valid sequence input downstream. Its content is selected in the UI (`centroidType`), and the spec is identical for both choices so downstream consumers are agnostic to the selection:

- **Computed (consensus)** (default) — the cluster's distinct members are aligned with kalign (MSA) and the centroid is the per-column majority residue. The **Residue Weighting** option (`weightByAbundance`) controls the vote: **Equal weight** (default) counts every clonotype once, so the centroid reflects the cluster's sequence set regardless of clonal expansion and column ties break deterministically (non-gap over gap, then alphabetically); **By abundance** weights each clonotype's vote by its summed abundance. May not match any observed member. Computed on the trimmed basis (`trim_sequence_N`). Each column emits its winning residue only when that residue holds at least `--consensus-threshold` (default `0.6`) of the column's weight; below that fraction the column emits `X` (IUPAC "any/unknown amino acid"), marking a low-confidence position. `X` is display-only and never enters the distance computation.
- **Representative** — the *observed* member that MMseqs2 picked (`clusterId == inputKey`); no MSA is run.

Alongside the selected centroid, each cluster **always** exposes a per-chain **reference centroid** (medoid) sequence — columns `reference_centroid_sequence_0` (and, on the trimmed basis, `reference_centroid_trim_sequence_0` / `reference_centroid_trimmed_fullSequence`; multi-chain runs produce `reference_centroid_sequence_0..N` and `reference_centroid_trim_sequence_0..N`). The reference centroid is a **real observed member** — the one minimizing the cluster profile distance (§ below) — so it contains real amino acids only and is guaranteed to exist in the sample, making it directly synthesizable. The reference centroid is shown in the table by default; the theoretical centroid is emitted with table visibility `optional` (present in the PFrame and addable, but hidden by default), so a real synthesizable anchor is the default-visible centroid.

`distanceToCentroid` and `clusterRadius` are computed from a **profile distance** over the kalign MSA, not from a flat string comparison and not from Levenshtein. Each member's residue in an aligned column `j` is charged `1 − pⱼ(residue)`, where `pⱼ` is the column's weighted fraction for that residue under the active **Residue Weighting** (equal-weight by default, or abundance-weighted), the gap counting as a residue. A member's per-chain raw distance `Dᵢ⁽ˢ⁾` sums these costs over its aligned columns; `distanceToCentroid = min(1, Σₛ Dᵢ⁽ˢ⁾ / Σₛ max(L_cons⁽ˢ⁾, ℓᵢ⁽ˢ⁾))`, where `L_cons⁽ˢ⁾` is the number of consensus (non-gap-majority) columns and `ℓᵢ⁽ˢ⁾` the member's non-gap length. This distribution-aware metric distinguishes a 70/30 column from a 51/49 one and is what the reference-centroid medoid (`argmin Dᵢ`) minimizes. It is MSA/distribution-based and runs identically in both `centroidType` modes.

```

clusterId -> Centroid seq (selected variant: computed kalign MSA consensus or representative member), [optional secondary sequences]

clusterId -> Reference centroid seq (medoid: real observed member minimizing the profile distance, always emitted), [optional secondary sequences]

[sampleId, clusterId] -> per-cluster abundance — one column per abundance column carried by the input (e.g. readCount, uniqueMoleculeCount), plus the corresponding fraction column

inputKey -> clusterId (cluster assignment per input row, used for downstream linking)

[inputKey, clusterId] -> 1 (isLinkerColumn=true)


Optional:

[inputKey, clusterId] -> distanceToCentroid (member profile distance, 1 − pⱼ(residue) per aligned column, normalized by max(L_cons, ℓᵢ); in [0,1])

[clusterId, clusterId] -> clusterRadius (max member distanceToCentroid per cluster)

```