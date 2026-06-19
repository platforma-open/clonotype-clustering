import polars as pl
import polars_ds as pds
import argparse
import re
import hashlib
import kalign

# --- Computed-centroid (kalign MSA consensus) constants ---
# Each cluster's distinct member sequences are aligned with kalign (multiple
# sequence alignment); the centroid is the per-column abundance-weighted majority
# residue over that MSA. Abundance is applied as a per-row weight during the
# column vote rather than by replicating sequences, so kalign sees each distinct
# sequence once.
#   MSA_MAX_MEMBERS — cap on distinct members per cluster fed to kalign; the
#                     top-MSA_MAX_MEMBERS by weight are kept and the rest are
#                     dropped (logged, never silent).
# A column only commits a residue when its winning residue holds at least
# --consensus-threshold of the column's total weight; otherwise the position is
# ambiguous and emits "X". This keeps a 51/49 column from being reported with the
# same confidence as a 70/30 one.
MSA_MAX_MEMBERS = 1000

parser = argparse.ArgumentParser(description='Process clustering results and compute summaries')
parser.add_argument('--trim-start', type=int, default=0, help='Number of amino acids to remove from start')
parser.add_argument('--trim-end', type=int, default=0, help='Number of amino acids to remove from end')
parser.add_argument('--per-chain-trim', action='store_true', help='Apply trimming to each chain before computing distances and summaries')
parser.add_argument('--min-seq-id', type=float, default=1.0, help='Minimum sequence identity threshold (0-1) used by mmseqs2. Used for singleton reassignment post-processing.')
parser.add_argument('--high-precision', action='store_true', help='Enable high-precision post-processing (singleton reassignment). Should match the high-precision mmseqs2 mode.')
parser.add_argument('--consensus-threshold', type=float, default=0.6,
                    help='Minimum fraction (0-1) of a MSA column\'s total abundance weight '
                         'the winning residue must hold for the theoretical (consensus) centroid '
                         'to commit that residue; below it the position is ambiguous and emits "X". '
                         'Default 0.6.')
parser.add_argument('--emit-plurality-centroid', action='store_true',
                    help='Also emit plurality-centroid.tsv: per-cluster abundance-weighted per-column '
                         'majority residue (consensus at threshold 0.0, so no "X").')
args = parser.parse_args()

trim_start = args.trim_start
trim_end = args.trim_end
per_chain_trim = args.per_chain_trim
min_seq_id = args.min_seq_id
consensus_threshold = args.consensus_threshold
emit_plurality = args.emit_plurality_centroid

clustersTsv = "clusters.tsv"
cloneTableTsv = "cloneTable.tsv"
dedupMappingTsv = "dedup_mapping.tsv"
clusterToSeqTsv = "cluster-to-seq.tsv"
cloneToClusterTsv = "clone-to-cluster.tsv"
abundancesTsv = "abundances.tsv"
abundancesPerClusterTsv = "abundances-per-cluster.tsv"
clusterRadiusTsv = "cluster-radius.tsv"
trimmedSequencesTsv = "trimmed-sequences.tsv"

# sampleId, clonotypeKey, clonotypeKeyLabel,sequence_..., 
# ...VGene, JGene
cloneTable = pl.read_csv(cloneTableTsv, separator="\t")

# Get all sequence columns if we have them
sequence_cols = [col for col in cloneTable.columns 
                 if col.startswith('sequence_')]

# Create trimmed versions of sequence columns if needed
def make_trimmed_expr(col_name: str) -> pl.Expr:
    expr = pl.col(col_name).fill_null("")
    if trim_start > 0:
        expr = expr.str.slice(trim_start)
    if trim_end > 0:
        # compute remaining length after end-trim; ensure non-negative
        rem_len = pl.when(expr.str.len_chars() > trim_end).then(
            (expr.str.len_chars() - pl.lit(trim_end))
        ).otherwise(pl.lit(0))
        expr = expr.str.slice(0, rem_len)
    return expr

trimmed_cols = []
if sequence_cols and (trim_start > 0 or trim_end > 0):
    # Generate trimmed columns for each sequence column
    with_exprs = []
    for c in sequence_cols:
        tcol = f"trim_{c}"
        trimmed_cols.append(tcol)
        with_exprs.append(make_trimmed_expr(c).alias(tcol))
    cloneTable = cloneTable.with_columns(with_exprs)
else:
    trimmed_cols = [f"trim_{c}" for c in sequence_cols]
    # If no trimming, just mirror originals for downstream uniformity
    with_exprs = [pl.col(c).fill_null("").alias(f"trim_{c}") for c in sequence_cols]
    if with_exprs:
        cloneTable = cloneTable.with_columns(with_exprs)

# Create a 'fullSequence' column by concatenating sequence_cols if they exist
if not sequence_cols:
    print("Warning: No sequence columns (e.g., 'sequence_0') found. Sequence-based distance calculation might fail or be incorrect.")
else:
    sorted_sequence_cols = sorted(sequence_cols)
    sorted_trimmed_cols = sorted(trimmed_cols)
    # Build original concatenation
    cloneTable = cloneTable.with_columns(
        pl.concat_str([pl.col(c).fill_null("") for c in sorted_sequence_cols], separator="====").alias('fullSequence')
    )
    # Build trimmed concatenation (per-chain trimming already applied into trim_* columns)
    cloneTable = cloneTable.with_columns(
        pl.concat_str([pl.col(c).fill_null("") for c in sorted_trimmed_cols], separator="====").alias('trimmed_fullSequence')
    )

# Transform clonotypeKeyLabel from "C-XXXXXX" (clonotype, MiXCR-side) or "P-XXXXXX"
# (peptide, peptide-extraction-side) into "CL-XXXXXX" (the cluster label).
# The computed centroid's own "Peptide Id" is NOT derived here — it is a hash of the
# consensus sequence itself, computed once the plurality centroid is known (see the
# peptideLabel derivation on plurality_df below).
cloneTable = cloneTable.with_columns(
    pl.col('clonotypeKeyLabel').str.replace(r'^[CP]-', 'CL-').alias('clusterLabel'),
)

# clusterId, clonotypeKey (both are representative keys from de-duplicated FASTA)
clusters = pl.read_csv(clustersTsv, separator="\t", has_header=False,
                       new_columns=["clusterId", "clonotypeKey"])

# Remove the "s-" prefix from clusterId and clonotypeKey. This prefix is added
# during FASTA preparation for mmseqs and needs to be removed to match keys
# in other tables like cloneTable.
clusters = clusters.with_columns(
    pl.col("clusterId").str.strip_prefix("s-"),
    pl.col("clonotypeKey").str.strip_prefix("s-")
)

def reassign_singletons(clusters: pl.DataFrame, cloneTable: pl.DataFrame,
                        min_seq_id: float) -> pl.DataFrame:
    """Reassign singleton cluster representatives to nearby non-singleton clusters.

    MMseqs2 kmer prefilter (k=5) can miss valid matches for short sequences (5-7 aa),
    leaving them as incorrect singletons. This function checks each singleton
    representative against all non-singleton centroids using bounded Levenshtein distance.

    Returns the (possibly updated) clusters DataFrame.
    """
    seq_col = 'trimmed_fullSequence' if 'trimmed_fullSequence' in cloneTable.columns else (
        'fullSequence' if 'fullSequence' in cloneTable.columns else None)

    if not seq_col:
        print("Singleton reassignment: skipped (no sequence columns available)")
        return clusters

    # Count representatives per cluster (before dedup expansion)
    rep_sizes = clusters.group_by("clusterId").agg(pl.len().alias("rep_size"))
    singleton_ids = rep_sizes.filter(pl.col("rep_size") == 1)["clusterId"]
    non_singleton_centroids = rep_sizes.filter(pl.col("rep_size") > 1)

    if singleton_ids.len() == 0 or non_singleton_centroids.height == 0:
        print(f"Singleton reassignment: skipped "
              f"({'no singletons' if singleton_ids.len() == 0 else 'no non-singleton clusters to reassign to'})")
        return clusters

    # Sequence lookup from cloneTable (keyed by clonotypeKey)
    seq_df = (
        cloneTable.select(["clonotypeKey", seq_col])
        .unique("clonotypeKey", keep="first")
    )

    # Singleton members with their sequences
    singleton_df = (
        clusters.filter(pl.col("clusterId").is_in(singleton_ids))
        .select(pl.col("clonotypeKey").alias("member_key"))
        .join(
            seq_df.select(
                pl.col("clonotypeKey").alias("member_key"),
                pl.col(seq_col).alias("member_seq")
            ),
            on="member_key", how="inner"
        )
    )

    # Non-singleton centroids with their sequences and sizes
    centroid_df = (
        non_singleton_centroids
        .select(["clusterId", "rep_size"])
        .join(
            seq_df.select(
                pl.col("clonotypeKey").alias("clusterId"),
                pl.col(seq_col).alias("centroid_seq")
            ),
            on="clusterId", how="inner"
        )
    )

    n_singletons = singleton_df.height
    n_centroids = centroid_df.height
    print(f"Singleton reassignment: checking {n_singletons} singletons against {n_centroids} centroids...")

    # Cross-join all singletons with all centroids, compute Levenshtein in Rust via polars_ds
    cross = singleton_df.join(centroid_df, how="cross")
    cross = cross.with_columns(
        pds.str_leven(pl.col("member_seq"), pl.col("centroid_seq"), return_sim=False).alias("distance"),
        pl.max_horizontal(
            pl.col("member_seq").str.len_chars(),
            pl.col("centroid_seq").str.len_chars()
        ).alias("max_len")
    )

    # Filter to matches within identity threshold: distance / max_len <= (1 - min_seq_id)
    max_dist_frac = 1.0 - min_seq_id
    matches = cross.filter(
        (pl.col("max_len") > 0) &
        (pl.col("distance").cast(pl.Float64) / pl.col("max_len").cast(pl.Float64) <= max_dist_frac)
    )

    if matches.height == 0:
        print(f"Singleton reassignment: 0 of {n_singletons} singletons matched "
              f"any non-singleton centroid (min-seq-id={min_seq_id})")
        return clusters

    # Pick best match per singleton: lowest normalized distance, then largest cluster
    matches = matches.with_columns(
        (pl.col("distance").cast(pl.Float64) / pl.col("max_len").cast(pl.Float64)).alias("norm_dist")
    )
    best_matches = (
        matches
        .sort(["norm_dist", "rep_size"], descending=[False, True])
        .group_by("member_key").first()
    )

    # Log reassignments (first 10)
    for row in best_matches.head(10).iter_rows(named=True):
        print(f"  reassign {row['member_key']} -> centroid {row['clusterId']} "
              f"(dist={row['distance']}, norm_dist={row['norm_dist']:.4f}, "
              f"seq='{row['member_seq']}', centroid_seq='{row['centroid_seq']}', "
              f"cluster_size={row['rep_size']})")
    if best_matches.height > 10:
        print(f"  ... and {best_matches.height - 10} more reassignments")

    # Apply reassignments to clusters DataFrame
    reassign_df = best_matches.select(
        pl.col("member_key").alias("r_key"),
        pl.col("clusterId").alias("new_clusterId")
    )
    clusters = clusters.join(reassign_df, left_on="clonotypeKey", right_on="r_key", how="left")
    clusters = clusters.with_columns(
        pl.coalesce(pl.col("new_clusterId"), pl.col("clusterId")).alias("clusterId")
    ).drop("new_clusterId")

    print(f"Singleton reassignment: {best_matches.height} of {n_singletons} singletons "
          f"reassigned to existing clusters (min-seq-id={min_seq_id})")
    return clusters


# --- Reassign singleton representatives to nearby non-singleton clusters ---
if not args.high_precision:
    print("Singleton reassignment: skipped (high-precision mode is off)")
elif min_seq_id >= 1.0:
    print("Singleton reassignment: skipped (min-seq-id=1.0, exact matching only)")
else:
    clusters = reassign_singletons(clusters, cloneTable, min_seq_id)

# --- Expand de-duplicated clusters back to all original clonotypeKeys ---
# The FASTA contained only unique sequences (one representative per group of
# identical sequences). MMseqs2 clustered those representatives. Now we expand
# each representative back to all original clonotypeKeys that share its sequence.
dedup_mapping = pl.read_csv(dedupMappingTsv, separator="\t")
# dedup_mapping has columns: representativeKey, clonotypeKey

num_representatives = clusters.select(pl.col("clonotypeKey").n_unique()).item()
clusters = clusters.rename({"clonotypeKey": "representativeKey"}).join(
    dedup_mapping,
    on="representativeKey",
    how="inner"
).drop("representativeKey")
print(f"Expanded clusters: {num_representatives} representatives -> {clusters.height} total clonotype-cluster assignments")

# --- Calculate cluster sizes directly in the clusters dataframe ---
clusters = clusters.with_columns(
    pl.col('clonotypeKey').count().over('clusterId').alias('size')
)

# Merge clusters with cloneTable to get clusterLabel for the centroid
# This 'clusterLabel' is the transformed "CL-XXXX" label of the centroid.
labelsTable_for_join = cloneTable.select(
    pl.col('clonotypeKey').alias('clusterId'), # Alias to 'clusterId' to match the left table's key name
    'clusterLabel', # The "CL-XXXX" label associated with this key in cloneTable
).unique(subset=['clusterId'], keep='first') # Unique on the new 'clusterId' column

clusters = clusters.join(
    labelsTable_for_join,
    on='clusterId', # Join on 'clusterId', present in both DataFrames with the same meaning
    how='left'
)

# --- Compute per-clonotype abundance weight ---
# Weight = abundance summed over sampleId per clonotypeKey. If there is no
# abundance column, every clonotype gets weight 1.
if "abundance" in cloneTable.columns:
    clonotype_weights = (
        cloneTable
        .group_by("clonotypeKey")
        .agg(pl.sum("abundance").cast(pl.Float64).alias("weight"))
        .with_columns(
            # Guard against null / non-positive total abundance -> fall back to 1.0
            pl.when(pl.col("weight").is_null() | (pl.col("weight") <= 0))
              .then(pl.lit(1.0, dtype=pl.Float64))
              .otherwise(pl.col("weight"))
              .alias("weight")
        )
    )
else:
    clonotype_weights = (
        cloneTable
        .select("clonotypeKey")
        .unique("clonotypeKey", keep="first")
        .with_columns(pl.lit(1.0, dtype=pl.Float64).alias("weight"))
    )


# kalign only understands biological-sequence letters. A stray non-letter — a stop
# codon "*", an underscore, a space (the one that actually bit us before) — either makes
# kalign choke or, worse, gets silently rewritten in its aligned output. The silent case
# corrupts the profile distance: _msa_profile_distances keys each member by its
# gap-stripped aligned row, and the caller looks that up with the original sequence, so
# any byte kalign changes makes the lookup miss and the member is charged full distance
# (and excluded from the medoid). To keep the round-trip exact, every non-letter is mapped
# to "X" (unknown residue) up front and that sanitized form is used as the canonical key
# everywhere — kalign feed, dedup key, and distance lookup. Length-preserving (1 char ->
# 1 char), so member lengths are unaffected. A no-op on clean input.
_NON_ALPHA_RE = re.compile(r"[^A-Za-z]")


def _sanitize_seq(seq: str) -> str:
    """Replace any non-letter character with 'X' so kalign never sees stray bytes."""
    return _NON_ALPHA_RE.sub("X", seq)


def _msa_consensus(aligned: list[str], weights: list[float], threshold: float) -> str:
    """Abundance-weighted column-majority consensus over a kalign MSA.

    `aligned` are equal-length gap-padded rows from kalign; `weights[i]` is the
    abundance weight of row i. For each column the residue with the greatest total
    weight wins (ties broken deterministically: non-gap over gap, then lexically).
    Columns whose majority residue is a gap contribute nothing to the centroid.

    A non-gap winner is only committed when it holds at least `threshold` of the
    column's total weight; otherwise no residue dominates and the position emits
    "X" (ambiguous). This stops a 51/49 column being reported as confidently as a
    70/30 one.
    """
    out = []
    for col in range(len(aligned[0])):
        tally: dict[str, float] = {}
        for row, w in zip(aligned, weights):
            c = row[col]
            tally[c] = tally.get(c, 0.0) + w
        # Max total weight; on ties prefer a real residue, then the smaller letter.
        best = max(tally.items(), key=lambda kv: (kv[1], kv[0] != "-", -ord(kv[0])))
        if best[0] == "-":
            continue  # gap-majority column: not part of the centroid
        total = sum(tally.values())
        # Commit the residue only when it clears the threshold, else mark ambiguous.
        out.append(best[0] if total > 0 and best[1] / total >= threshold else "X")
    return "".join(out)


def _align_chain(values: list[str], weights: list[float], cluster_id: str):
    """Build one cluster's per-chain kalign MSA ONCE; everything else derives from it.

    The alignment is a pure function of the (deduplicated, ordered, capped) sequence
    set — the abundance weights only matter to the column vote downstream, not to the
    alignment. So this runs kalign a single time and the consensus (theoretical
    centroid), the plurality consensus (threshold 0) and the profile distances/medoid
    all read the SAME result, instead of re-aligning the same sequences 2-4× (the
    redundancy was worst in single-cell, one extra pass per chain). See derive_consensus
    / derive_distances.

    - Drops empty sequences (a member missing this chain contributes nothing here).
    - Deduplicates identical sequences, summing their abundance weights, so kalign
      aligns each distinct sequence once and the weight still drives the column vote.
    - Sanitizes (see _sanitize_seq) before keying so stray non-letters never reach kalign.
    - Caps distinct members at MSA_MAX_MEMBERS by descending weight; logs how many
      dropped (no silent truncation).

    Returns a (mode, payload) bundle:
      - ("empty", None)               — 0 non-empty members.
      - ("single", seq)               — exactly one distinct member (kalign needs >= 2).
      - ("msa", (aligned, weights))   — gap-padded rows + their member weights.
    """
    # Collapse identical sequences, summing weights (one row per distinct sequence).
    weight_by_seq: dict[str, float] = {}
    for v, w in zip(values, weights):
        if v:
            s = _sanitize_seq(v)
            weight_by_seq[s] = weight_by_seq.get(s, 0.0) + w
    if not weight_by_seq:
        return ("empty", None)

    # Deterministic feed order for kalign (§4): descending weight, then lexicographic
    # on the sequence. This fixes the MSA — and hence the centroid, the medoid and the
    # clusterId labels derived from them — run-to-run, removing the CID-conflict risk.
    pairs = sorted(weight_by_seq.items(), key=lambda p: (-p[1], p[0]))

    # Cap distinct members per cluster, keeping the top MSA_MAX_MEMBERS in that same
    # deterministic order (no silent truncation; the kept set is stable too).
    if len(pairs) > MSA_MAX_MEMBERS:
        dropped = len(pairs) - MSA_MAX_MEMBERS
        pairs = pairs[:MSA_MAX_MEMBERS]
        print(f"  cluster {cluster_id}: capped to {MSA_MAX_MEMBERS} distinct members "
              f"by weight, dropped {dropped}")

    if len(pairs) == 1:
        return ("single", pairs[0][0])

    seqs = [s for s, _ in pairs]
    member_weights = [w for _, w in pairs]
    aligned = kalign.align(seqs, seq_type="auto")
    return ("msa", (aligned, member_weights))


def derive_consensus(bundle, threshold: float) -> str:
    """Abundance-weighted column-majority consensus from an _align_chain bundle.

    0 members -> ""; a single distinct member -> that sequence unchanged; otherwise the
    weighted consensus over the shared MSA (see _msa_consensus). At threshold 0.0 the "X"
    branch is unreachable, giving the X-free plurality centroid.
    """
    mode, payload = bundle
    if mode == "empty":
        return ""
    if mode == "single":
        return payload
    aligned, member_weights = payload
    return _msa_consensus(aligned, member_weights, threshold)


def _msa_profile_distances(aligned: list[str], weights: list[float]) -> tuple[dict[str, float], int]:
    """Positional profile distance of each aligned row to the column profile (§3).

    `aligned` are equal-length gap-padded rows from kalign; `weights[i]` is the
    abundance weight of row i. For each column j build the abundance-weighted
    fraction p_j(a) = w_j(a) / W over residues a (the gap "-" is treated as a
    residue, so Σ_a p_j(a) = 1). The cost of a residue in a column is 1 - p_j(a),
    applied on EVERY column (gap columns included), so a row's distance is

        D = Σ_j ( 1 - p_j( row[j] ) ).

    Returns (D_by_seq, L_cons) where D_by_seq maps each aligned row's sequence
    string (with gaps stripped, i.e. the original member sequence) to its profile
    distance D, and L_cons is the number of non-gap-majority consensus columns
    (the column count that contributes to the centroid; used for normalization).
    """
    n_cols = len(aligned[0])
    W = sum(weights)
    # Per-column fractions p_j(a) and the gap-majority flag (mirrors _msa_consensus).
    col_fracs: list[dict[str, float]] = []
    l_cons = 0
    for col in range(n_cols):
        tally: dict[str, float] = {}
        for row, w in zip(aligned, weights):
            c = row[col]
            tally[c] = tally.get(c, 0.0) + w
        col_fracs.append({a: (wa / W if W > 0 else 0.0) for a, wa in tally.items()})
        # Same column winner / tie-break as the consensus: non-gap over gap, then lexical.
        best = max(tally.items(), key=lambda kv: (kv[1], kv[0] != "-", -ord(kv[0])))
        if best[0] != "-":
            l_cons += 1  # non-gap-majority column: part of the centroid length

    # Each member's distance is the sum over columns of 1 - p_j(its residue).
    d_by_seq: dict[str, float] = {}
    for row in aligned:
        d = 0.0
        for col in range(n_cols):
            d += 1.0 - col_fracs[col].get(row[col], 0.0)
        d_by_seq[row.replace("-", "")] = d
    return d_by_seq, l_cons


def derive_distances(bundle) -> tuple[dict[str, float], int]:
    """Per-distinct-member profile distance (§3) from an _align_chain bundle.

    Because it reads the SAME alignment as derive_consensus, the distance is computed
    over exactly the alignment that underlies the centroid — no second kalign pass.
    Returns (D_by_seq, L_cons):
      - D_by_seq maps each distinct (gap-stripped, sanitized) member sequence to its
        profile distance D^(s) for this chain. The caller looks up with the same
        sanitized form.
      - L_cons is the number of non-gap-majority consensus columns for this chain.
    Members dropped by the cap are not in D_by_seq; the caller charges them full length.

    Edge cases: 0 non-empty members -> ({}, 0); a single distinct member -> distance 0
    against itself, L_cons = its length.
    """
    mode, payload = bundle
    if mode == "empty":
        return {}, 0
    if mode == "single":
        seq = payload
        return {seq: 0.0}, len(seq)
    aligned, member_weights = payload
    return _msa_profile_distances(aligned, member_weights)


def compute_centroid_and_distance(clusters_df: pl.DataFrame,
                                  cloneTable: pl.DataFrame,
                                  weights_df: pl.DataFrame,
                                  seq_cols: list[str],
                                  trim_cols: list[str],
                                  threshold: float,
                                  emit_plurality: bool,
                                  no_trim: bool):
    """Single per-cluster pass: align each chain ONCE and derive everything from it.

    Replaces the previous three separate kalign passes — theoretical consensus,
    plurality consensus (threshold 0) and profile distance/medoid — which each
    re-aligned the same per-cluster, per-chain sequences (up to 4x redundant work, worst
    in single-cell: one extra pass per chain). Here every (cluster, chain) is aligned a
    single time via _align_chain and all three results read that one alignment.

    seq_cols[i] and trim_cols[i] are the untrimmed / trimmed columns of the SAME chain
    (trim_cols[i] == "trim_" + seq_cols[i]). The trimmed centroid, the plurality centroid
    and the distance/medoid all use trim_cols (the chains the distance has always used);
    the untrimmed centroid uses seq_cols. When trimming is off (`no_trim`) the trim_
    column is a byte copy of the original, so the untrimmed centroid reuses the trimmed
    alignment instead of aligning again.

    Returns (centroid_df, plurality_df, distance_df, medoid_df) with the same columns and
    schemas the old compute_consensus / compute_profile_distance_and_medoid produced:
      - centroid_df:  [clusterId, centroid_<seq_cols>, centroid_<trim_cols>,
                       centroid_trimmed_fullSequence]
      - plurality_df: [clusterId, plurality_centroid_<trim_cols>,
                       plurality_centroid_trimmed_fullSequence] (None values when not
                       emit_plurality)
      - distance_df:  [clusterId, clonotypeKey, distanceToCentroid]
      - medoid_df:    [clusterId, medoid_key]
    """
    # One row per (clusterId, clonotypeKey) carrying every chain value (untrimmed +
    # trimmed) and the weight; grouped into per-cluster lists in a single pass. All list
    # aggregations in one .agg() share the same per-group row order, so __keys / __weights
    # / __vals_* stay index-aligned (the distance assembly relies on this).
    all_cols = seq_cols + trim_cols
    value_lookup = cloneTable.select(
        [pl.col("clonotypeKey")]
        + [pl.col(c).fill_null("").alias(f"__v_{c}") for c in all_cols]
    ).unique("clonotypeKey", keep="first")

    members = (
        clusters_df
        .select(["clusterId", "clonotypeKey"])
        .unique(subset=["clusterId", "clonotypeKey"], keep="first")
        .join(value_lookup, on="clonotypeKey", how="left")
        .join(weights_df, on="clonotypeKey", how="left")
        .with_columns(
            [pl.col(f"__v_{c}").fill_null("") for c in all_cols]
            + [pl.col("weight").fill_null(1.0)]
        )
    )

    grouped = (
        members
        .group_by("clusterId")
        .agg(
            pl.col("clonotypeKey").alias("__keys"),
            pl.col("weight").alias("__weights"),
            *[pl.col(f"__v_{c}").alias(f"__vals_{c}") for c in all_cols],
        )
    )

    # Output column accumulators (lists, one entry per cluster row).
    centroid_out = {"clusterId": []}
    for c in seq_cols:
        centroid_out[f"centroid_{c}"] = []
    for c in trim_cols:
        centroid_out[f"centroid_{c}"] = []
    centroid_out["centroid_trimmed_fullSequence"] = []

    plurality_out = {"clusterId": []}
    for c in trim_cols:
        plurality_out[f"plurality_centroid_{c}"] = []
    plurality_out["plurality_centroid_trimmed_fullSequence"] = []

    dist_clusters = []
    dist_keys = []
    dist_values = []
    medoid_clusters = []
    medoid_keys = []

    # centroid_trimmed_fullSequence / plurality_* join the trim chains in sorted chain
    # order (mirrors trimmed_fullSequence).
    sorted_trim_cols = sorted(trim_cols)

    for row in grouped.iter_rows(named=True):
        cluster_id = row["clusterId"]
        keys = row["__keys"]
        wts = row["__weights"]

        cons_trim: dict[str, str] = {}            # trim_col -> theoretical centroid (@ threshold)
        plur_trim: dict[str, str] = {}            # trim_col -> plurality centroid (@ 0.0) or None
        d_by_seq_chain: dict[str, dict] = {}      # trim_col -> {sanitized seq: D^(s)}
        l_cons_chain: dict[str, int] = {}         # trim_col -> L_cons^(s)
        cons_seq: dict[str, str] = {}             # seq_col -> untrimmed centroid

        for sc, tc in zip(seq_cols, trim_cols):
            # Align the trimmed chain ONCE; consensus, plurality and distance share it.
            bundle_t = _align_chain(row[f"__vals_{tc}"], wts, cluster_id)
            cons_trim[tc] = derive_consensus(bundle_t, threshold)
            plur_trim[tc] = derive_consensus(bundle_t, 0.0) if emit_plurality else None
            d_by_seq_chain[tc], l_cons_chain[tc] = derive_distances(bundle_t)

            # Untrimmed centroid: identical to the trimmed one when trimming is off (the
            # trim_ column is a byte copy of the original), else align separately.
            if no_trim:
                cons_seq[sc] = cons_trim[tc]
            else:
                bundle_u = _align_chain(row[f"__vals_{sc}"], wts, cluster_id)
                cons_seq[sc] = derive_consensus(bundle_u, threshold)

        # --- centroid row ---
        centroid_out["clusterId"].append(cluster_id)
        for c in seq_cols:
            centroid_out[f"centroid_{c}"].append(cons_seq[c])
        for c in trim_cols:
            centroid_out[f"centroid_{c}"].append(cons_trim[c])
        centroid_out["centroid_trimmed_fullSequence"].append(
            "====".join(cons_trim[c] for c in sorted_trim_cols)
        )

        # --- plurality row (values only when --emit-plurality-centroid is set) ---
        plurality_out["clusterId"].append(cluster_id)
        if emit_plurality:
            for c in trim_cols:
                plurality_out[f"plurality_centroid_{c}"].append(plur_trim[c])
            plurality_out["plurality_centroid_trimmed_fullSequence"].append(
                "====".join(plur_trim[c] for c in sorted_trim_cols)
            )
        else:
            for c in trim_cols:
                plurality_out[f"plurality_centroid_{c}"].append(None)
            plurality_out["plurality_centroid_trimmed_fullSequence"].append(None)

        # --- profile distance (§3) + medoid (§2) over the trimmed chains ---
        # weight is per clonotypeKey (constant across the cluster's chains).
        weight_by_key: dict[str, float] = {}
        seq_by_key: dict[str, str] = {}
        d_total_by_key: dict[str, float] = {}
        norm_by_key: dict[str, float] = {}
        complete_by_key: dict[str, bool] = {}   # has every chain the cluster actually has
        for idx, k in enumerate(keys):
            weight_by_key[k] = wts[idx]
            sum_d = 0.0          # Σ_s D_i^(s) (raw numerator, also the medoid key)
            sum_norm = 0.0       # Σ_s max(L_cons^(s), ℓ_i^(s))
            joined_parts = []
            complete = True      # member carries every chain present in the cluster
            for tc in trim_cols:
                seq = row[f"__vals_{tc}"][idx]
                joined_parts.append(seq)
                member_len = len(seq)
                if seq:
                    # d_by_seq is keyed by the sanitized sequence (see _sanitize_seq); look
                    # up with the same form or stray-char members would miss and be charged
                    # full distance. Sanitizing is length-preserving, so member_len is
                    # unchanged. Dropped-by-cap members are absent from d_by_seq -> charge
                    # full length.
                    d_s = d_by_seq_chain[tc].get(_sanitize_seq(seq), float(member_len))
                    sum_d += d_s
                    sum_norm += max(l_cons_chain[tc], member_len)
                else:
                    # Missing chain. A dropout is a sequencing artifact, not biology, so we
                    # do NOT penalize it: the chain is dropped from BOTH the numerator and the
                    # denominator, leaving its absence neutral to the distance. But a member
                    # missing a chain the cluster actually has (l_cons_chain[tc] > 0) is an
                    # incomplete clone and must not be picked as the reference centroid, so
                    # flag it (see medoid below). When no member has this chain at all
                    # (l_cons_chain[tc] == 0) the chain simply doesn't exist for the cluster.
                    if l_cons_chain[tc] > 0:
                        complete = False
            seq_by_key[k] = "====".join(joined_parts)
            d_total_by_key[k] = sum_d
            norm_by_key[k] = min(1.0, sum_d / sum_norm) if sum_norm > 0 else 0.0
            complete_by_key[k] = complete

        for k in keys:
            dist_clusters.append(cluster_id)
            dist_keys.append(k)
            dist_values.append(norm_by_key[k])

        # Medoid (reference centroid): argmin D_i, tie-break (min D_i, -w_i, seq), but ONLY
        # over COMPLETE members — a clone missing a chain (now unpenalized in the distance)
        # must not be chosen as the biological reference. Dropped-by-cap members carry
        # inflated D_i so they don't win the argmin. Fall back to all members only if no
        # member is complete (degenerate cluster where every member lacks some chain).
        candidate_keys = [k for k in keys if complete_by_key[k]] or keys
        best_key = min(
            candidate_keys,
            key=lambda k: (d_total_by_key[k], -weight_by_key[k], seq_by_key[k])
        )
        medoid_clusters.append(cluster_id)
        medoid_keys.append(best_key)

    centroid_schema = {"clusterId": clusters_df.schema["clusterId"]}
    for c in seq_cols:
        centroid_schema[f"centroid_{c}"] = pl.String
    for c in trim_cols:
        centroid_schema[f"centroid_{c}"] = pl.String
    centroid_schema["centroid_trimmed_fullSequence"] = pl.String
    centroid_df = pl.DataFrame(centroid_out, schema=centroid_schema)

    plurality_schema = {"clusterId": clusters_df.schema["clusterId"]}
    for c in trim_cols:
        plurality_schema[f"plurality_centroid_{c}"] = pl.String
    plurality_schema["plurality_centroid_trimmed_fullSequence"] = pl.String
    plurality_df = pl.DataFrame(plurality_out, schema=plurality_schema)

    distance_df = pl.DataFrame(
        {
            "clusterId": dist_clusters,
            "clonotypeKey": dist_keys,
            "distanceToCentroid": dist_values,
        },
        schema={
            "clusterId": clusters_df.schema["clusterId"],
            "clonotypeKey": clusters_df.schema["clonotypeKey"],
            "distanceToCentroid": pl.Float64,
        },
    )
    medoid_df = pl.DataFrame(
        {"clusterId": medoid_clusters, "medoid_key": medoid_keys},
        schema={"clusterId": clusters_df.schema["clusterId"], "medoid_key": pl.String},
    )
    return centroid_df, plurality_df, distance_df, medoid_df


# --- Theoretical centroid + plurality centroid + profile distance/medoid ---
# All three derive from a SINGLE per-cluster, per-chain kalign MSA (see
# compute_centroid_and_distance), instead of re-aligning the same sequences in three
# separate passes. The theoretical centroid (abundance-weighted consensus) drives the
# distance/radius metrics; the reference centroid (medoid) is computed from the same
# alignment and kept purely as a reference. trim_sequence_N equals sequence_N when no
# trimming is configured, so the untrimmed centroid reuses the trimmed alignment then.
no_trim = (trim_start == 0 and trim_end == 0)

centroid_df = None
distance_member_df = None    # [clusterId, clonotypeKey, distanceToCentroid]
reference_df = None          # reference_centroid_* per clusterId
reference_cluster_to_seq_cols = []

if sequence_cols:
    centroid_df, plurality_df, distance_member_df, medoid_df = compute_centroid_and_distance(
        clusters, cloneTable, clonotype_weights,
        sequence_cols, trimmed_cols, consensus_threshold, emit_plurality, no_trim,
    )
else:
    # No sequence columns: still write a header-only plurality file (the clustering
    # workflow always saveFiles/getFiles it), matching create-empty-files.py's schema.
    plurality_df = (
        clusters.select("clusterId").unique("clusterId", keep="first")
        .with_columns(pl.lit(None, dtype=pl.Utf8).alias("plurality_centroid_trimmed_fullSequence"))
    )

# clusterLabel: the CL-XXXX label, imported as the variantKey axis's own label column so the
# exported dataset's axis displays "CL-..." instead of the raw clusterId value (and merges with
# the same label reached through the linker, instead of showing as a duplicate column).
# Linker source: a duplicate of clusterId plus a constant link value. The exported dataset lives
# on the variantKey axis (values = clusterId); the linker column carries both that axis and the
# cluster-properties clusterId axis, so a downstream block anchoring the consensus dataset can
# reach every cluster property (all on the clusterId axis). clusterIdLink feeds the second axis
# (the import projects each axis by its own column name, so the two axes need distinct columns).
plurality_df = plurality_df.join(
    clusters.select(["clusterId", "clusterLabel"]).unique("clusterId", keep="first"),
    on="clusterId", how="left",
).with_columns(
    pl.col("clusterId").alias("clusterIdLink"),
    pl.lit(1, dtype=pl.Int64).alias("link"),
)

# peptideLabel: the computed centroid's "Peptide Id", exposed on the variantKey axis.
# Peptide ids are sequence-derived properties, so the theoretical centroid (a NEW sequence
# that need not match any observed member) gets its own id derived from the consensus
# sequence itself — a bare hex hash of plurality_centroid_trimmed_fullSequence, with no
# "P-"/"C-"/"CL-" prefix so it is visibly a hash and never collides with a real peptide id
# in the original dataset. Same consensus sequence -> same id, deterministically. Null when
# there is no centroid sequence (no sequence columns, or plurality not emitted).
def _seq_hash(seq):
    if seq is None or seq == "":
        return None
    return hashlib.sha1(seq.encode("utf-8")).hexdigest()[:16]

plurality_df = plurality_df.with_columns(
    pl.col("plurality_centroid_trimmed_fullSequence")
      .map_elements(_seq_hash, return_dtype=pl.String)
      .alias("peptideLabel")
)

# plurality-centroid.tsv is ALWAYS written; values are present only when
# --emit-plurality-centroid is set (the threshold-0, X-free plurality consensus), and the
# workflow only imports it when the "Generate centroid dataset" checkbox is on. Computing
# it from the already-built MSA adds no extra kalign pass.
plurality_df.write_csv("plurality-centroid.tsv", separator="\t")

# Ordered list of centroid columns emitted into cluster-to-seq.tsv.
centroid_cluster_to_seq_cols = (
    [f"centroid_{c}" for c in sequence_cols]
    + [f"centroid_{c}" for c in trimmed_cols]
    + (["centroid_trimmed_fullSequence"] if sequence_cols else [])
)

# --- Reference centroid (medoid) columns from the medoid computed above ---
if sequence_cols:
    # Reference centroid = the medoid member's own per-chain sequences (a real member),
    # mirroring the centroid_* set: reference_centroid_<sequence_N> /
    # reference_centroid_<trim_sequence_N> / reference_centroid_trimmed_fullSequence.
    ref_source_cols = sequence_cols + trimmed_cols + ["trimmed_fullSequence"]
    ref_lookup = (
        cloneTable
        .select(
            [pl.col("clonotypeKey").alias("medoid_key")]
            + [pl.col(c).fill_null("").alias(f"reference_centroid_{c}") for c in ref_source_cols]
        )
        .unique("medoid_key", keep="first")
    )
    reference_df = medoid_df.join(ref_lookup, on="medoid_key", how="left").drop("medoid_key")

    reference_cluster_to_seq_cols = (
        [f"reference_centroid_{c}" for c in sequence_cols]
        + [f"reference_centroid_{c}" for c in trimmed_cols]
        + ["reference_centroid_trimmed_fullSequence"]
    )

# --- Generate cluster-to-seq.tsv ---
# Prepare the right DataFrame for the join, ensuring 'clusterId' and 'size' are treated as payload.
# The 'clusterLabel' here is the centroid's transformed label.
# We also need the centroid's sequence columns for this file.

# First, ensure 'clusters' has 'clusterLabel' (it should from the join above)
# Then, get sequence columns from the centroid.
# Centroid's key is 'clusterId' in the 'clusters' table.
# We need to join 'clusters' with 'cloneTable' (where 'clonotypeKey' is centroid's key)
# to fetch the sequence_cols for the centroid.

# Select sequence columns and 'clonotypeKey' from cloneTable for centroids
centroid_sequences_for_cts = cloneTable.select(
    [pl.col('clonotypeKey').alias("centroid_key_cts")] + sequence_cols + trimmed_cols + (["trimmed_fullSequence"] if sequence_cols else [])
).unique("centroid_key_cts", keep="first")

# Join clusters with centroid_sequences_for_cts
# 'clusters' has: clusterId (centroid key), clonotypeKey (member key), size, clusterLabel (centroid's CL-label)
temp_cluster_to_seq_data = clusters.join(
    centroid_sequences_for_cts,
    left_on="clusterId",
    right_on="centroid_key_cts",
    how="left" # Keep all clusters
)

required_cols_cts = ['clusterId', 'clusterLabel', 'size'] + sequence_cols + trimmed_cols + (['trimmed_fullSequence'] if sequence_cols else [])
# Select necessary columns. The sequence_cols will be from the centroid.
# We need to ensure we pick one row per clusterId.
# The join above might create multiple rows if a clusterId appeared multiple times in clusters
# (e.g. if clusters wasn't unique by clusterId before, though size calculation implies it's grouped by clusterId)
# However, the goal is one centroid sequence per cluster.
# The 'clusters' table after size calculation effectively lists members and their clusterId.
# For cluster-to-seq, we need one entry per clusterId, with its centroid's details.

# Let's use the 'clusterId' (centroid key) and its 'clusterLabel' and 'size' from the 'clusters' table,
# then join to get the centroid's sequences from 'cloneTable'.
# Create a base for cluster_to_seq from unique clusterIds and their already determined labels/sizes.
# Note: 'clusters' contains member clonotypeKeys. We need unique clusterIds.
unique_clusters_info = clusters.select(["clusterId", "clusterLabel", "size"]).unique(subset=["clusterId"], keep="first")

cluster_to_seq_df = unique_clusters_info.join(
    centroid_sequences_for_cts, # Contains centroid_key_cts and its sequence_cols
    left_on="clusterId",
    right_on="centroid_key_cts",
    how="left"
)

# Attach theoretical centroid (consensus) columns, keyed by clusterId.
if centroid_df is not None:
    cluster_to_seq_df = cluster_to_seq_df.join(centroid_df, on="clusterId", how="left")

# Attach reference centroid (medoid) columns, keyed by clusterId. Always emitted.
if reference_df is not None:
    cluster_to_seq_df = cluster_to_seq_df.join(reference_df, on="clusterId", how="left")

cluster_to_seq = cluster_to_seq_df.select(
    required_cols_cts + centroid_cluster_to_seq_cols + reference_cluster_to_seq_cols
)
cluster_to_seq.write_csv(clusterToSeqTsv, separator="\t")


# --- Generate clone-to-cluster.tsv ---
# 'clusters' should have: clusterId (centroid key), clonotypeKey (member key), clusterLabel (centroid's CL-label)
clone_to_cluster = clusters.select(['clusterId',
                                    'clonotypeKey',
                                    'clusterLabel']
                                   ).with_columns(pl.lit(1).alias('link'))
clone_to_cluster.write_csv(cloneToClusterTsv, separator="\t")


# --- Generate abundances.tsv ---
# Merge cloneTable and clusters to link abundances to clusters
# We need 'clusterId' from the 'clusters' table.
merged_abundances = cloneTable.select(['sampleId', 'clonotypeKey', 'abundance']).join(
    clusters.select(['clusterId', 'clonotypeKey']).unique(subset=["clonotypeKey"], keep="first"), # Ensure one cluster per clonotypeKey
    left_on='clonotypeKey', 
    right_on='clonotypeKey', 
    how='inner'
)

cluster_abundances = merged_abundances.group_by(['sampleId', 'clusterId']).agg(
    pl.sum('abundance').alias('abundance')
)

cluster_abundances = cluster_abundances.with_columns(
    pl.sum('abundance').over('sampleId').alias('total_sample_abundance')
)
cluster_abundances = cluster_abundances.with_columns(
    (pl.col('abundance') / pl.col('total_sample_abundance')).alias('abundance_normalized')
)
cluster_abundances = cluster_abundances.drop('total_sample_abundance')

cluster_abundances.write_csv(abundancesTsv, separator="\t")

# --- Generate abundances-per-cluster.tsv ---
abundances_per_cluster = cluster_abundances.group_by(
    'clusterId').agg(pl.sum('abundance').alias('abundance_per_cluster'))

# Calculate abundance fraction per cluster (fraction of total abundance across all clusters)
total_abundance = abundances_per_cluster.select(pl.sum('abundance_per_cluster')).item()
abundances_per_cluster = abundances_per_cluster.with_columns(
    pl.when(pl.lit(total_abundance) > 0)
      .then(pl.col('abundance_per_cluster') / pl.lit(total_abundance))
      .otherwise(pl.lit(0.0, dtype=pl.Float64))
      .alias('abundance_fraction_per_cluster')
)

abundances_per_cluster.write_csv(abundancesPerClusterTsv, separator="\t")

# --- Get top clusters for bubble plot ---
top_cluster_ids_df = abundances_per_cluster.sort(
    'abundance_per_cluster', descending=True
).head(100).select('clusterId')

# --- Export per-clonotype trimmed sequences ---
if sequence_cols:
    # Ensure trimmed_fullSequence and per-chain trimmed columns exist (created earlier)
    select_exprs = [pl.col("clonotypeKey")]
    if "trimmed_fullSequence" in cloneTable.columns:
        select_exprs.append(pl.col("trimmed_fullSequence"))
    elif "fullSequence" in cloneTable.columns:
        select_exprs.append(pl.col("fullSequence").alias("trimmed_fullSequence"))

    for c in sorted(trimmed_cols):
        if c in cloneTable.columns:
            select_exprs.append(pl.col(c))

    (
        cloneTable
        .select(select_exprs)
        .unique(subset=["clonotypeKey"], keep="first")
    ).write_csv(trimmedSequencesTsv, separator="\t")
else:
    # No sequences — write empty file with headers
    pl.DataFrame({
        "clonotypeKey": [],
        "trimmed_fullSequence": []
    }).write_csv(trimmedSequencesTsv, separator="\t")

# --- Generate distance_to_centroid.tsv (New Segmented Approach) ---

# Base DataFrame: member's key and original label
# 'clonotypeKey' is the member's key.
# 'clonotypeKeyLabel' is the member's original label (e.g., "C-YYYY").
# 'clusterId' is the centroid's key.
# 'clusterLabel' is the centroid's transformed label (e.g., "CL-XXXX"), already in 'clusters' table.

# Start with the member-to-centroid assignments from the 'clusters' table.
# 'clusters' has: clonotypeKey (member), clusterId (centroid), size, clusterLabel (centroid's CL-label).
distance_df_base = clusters.select([
    pl.col("clonotypeKey"),             # Member's key
    pl.col("clusterId"),               # Centroid's key
    pl.col("clusterLabel")             # Centroid's transformed "CL-" label
])

# Add member's original 'clonotypeKeyLabel'
member_original_labels = cloneTable.select([
    pl.col("clonotypeKey").alias("member_key_for_label_join"),
    pl.col("clonotypeKeyLabel")        # Member's original "C-" label
]).unique("member_key_for_label_join", keep="first")

distance_df = distance_df_base.join(
    member_original_labels,
    left_on="clonotypeKey",
    right_on="member_key_for_label_join",
    how="left" # Should always find a match if clonotypeKey comes from cloneTable initially
)


if not sequence_cols:
    print("No sequence columns found. Setting distanceToCentroid to 0.0 for all entries.")
    distance_df = distance_df.with_columns(
        pl.lit(0.0, dtype=pl.Float64).alias("distanceToCentroid")
    )
else:
    # distanceToCentroid is the positional profile distance (§3), precomputed per
    # member over the same per-cluster MSA as the centroid (see
    # compute_centroid_and_distance). Attach it by (clusterId, clonotypeKey);
    # this replaces the previous whole-string pds.str_leven against the centroid.
    distance_df = distance_df.join(
        distance_member_df,
        on=["clusterId", "clonotypeKey"],
        how="left"
    ).with_columns(
        pl.col("distanceToCentroid").fill_null(0.0)
    )


# Select final columns for the output TSV
# Ensure all these columns exist in distance_df at this point
# clonotypeKey, clusterId, clusterLabel, clonotypeKeyLabel, distanceToCentroid
output_columns = [
    "clonotypeKey",        # Member's key
    "clusterId",           # Centroid's key
    "clonotypeKeyLabel",   # Member's original "C-" label
    "clusterLabel",        # Centroid's transformed "CL-" label
    "distanceToCentroid"
]
# Reorder/select columns if necessary, ensuring they exist
# If any are missing (e.g. if clonotypeKeyLabel was not joined correctly), this would error.
# The construction of distance_df above should ensure these are present.
distance_df_to_write = distance_df.select(output_columns)


# Drop duplicate rows based on clonotypeKey (member's key), keeping the first occurrence.
# This ensures one distance entry per member clonotype.
distance_df_to_write = distance_df_to_write.unique(subset=["clonotypeKey"], keep="first")

# Output to TSV
output_distance_tsv = "distance_to_centroid.tsv"
distance_df_to_write.write_csv(output_distance_tsv, separator="\t")

print(f"Generated {output_distance_tsv}")

if distance_df_to_write.height == distance_df_to_write.select(pl.col("clonotypeKey").n_unique()).item():
    print(f"Verified: All clonotypeKey values in the written {output_distance_tsv} are unique.")
else:
    print(f"WARNING: clonotypeKey values in the written {output_distance_tsv} are still not unique. This is unexpected after dropping duplicates.")

# --- Generate cluster-radius.tsv ---
# Calculate max normalized distance per cluster
cluster_radius_df = distance_df_to_write.group_by("clusterId").agg(
    pl.max("distanceToCentroid").alias("clusterRadius")
)

# Write to TSV
cluster_radius_df.write_csv(clusterRadiusTsv, separator="\t")
print(f"Generated {clusterRadiusTsv}")

# --- Generate files for top clusters for bubble plotting ---
cluster_abundances_top_df = cluster_abundances.join(top_cluster_ids_df, on="clusterId", how="inner")
cluster_abundances_top_df.write_csv("abundances-top.tsv", separator="\t")

cluster_to_seq_top_df = cluster_to_seq.join(top_cluster_ids_df, on="clusterId", how="inner")
cluster_to_seq_top_df.write_csv("cluster-to-seq-top.tsv", separator="\t")

cluster_radius_top_df = cluster_radius_df.join(top_cluster_ids_df, on="clusterId", how="inner")
cluster_radius_top_df.write_csv("cluster-radius-top.tsv", separator="\t")
