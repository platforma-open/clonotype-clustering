"""Singleton reassignment for high-precision clustering.

Reassign singleton cluster representatives to nearby non-singleton clusters. For each
centroid it prunes to length-compatible singletons, applies a bounded Levenshtein
prefilter, then an exact recheck, keeping only a running best-per-singleton, so peak
memory is O(#singletons). In its own module so it can be unit-tested without running
the whole process_results.py pipeline.
"""
import math

import polars as pl
import polars_ds as pds

# Default cap on accumulated match rows before reducing to the running
# best-per-singleton. Bounds peak memory; the reassignment result is identical
# for any value (correctness is independent of it). Exposed as the `flush_rows`
# argument so tests can force the reduction path on small inputs.
FLUSH_ROWS = 2_000_000


def reassign_singletons(clusters: pl.DataFrame, cloneTable: pl.DataFrame,
                        min_seq_id: float, flush_rows: int = FLUSH_ROWS) -> pl.DataFrame:
    """Reassign singleton cluster representatives to nearby non-singleton clusters.

    MMseqs2 kmer prefilter (k=5) can miss valid matches for short sequences (5-7 aa),
    leaving them as incorrect singletons. This checks each singleton representative
    against non-singleton centroids within the identity threshold.

    For each centroid we
      (1) keep only length-compatible singletons -- a match needs
          |len_s - len_c| <= (1 - min_seq_id) * max_len, so others provably can't match;
      (2) run pds.filter_by_levenshtein as a generous bounded prefilter (never drops a
          true match; a fused, early-exiting distance check with no intermediate frame);
      (3) apply the exact normalized recheck.
    Only a RUNNING best-per-singleton is kept (periodically reduced), so peak memory is
    O(#singletons) regardless of how many pairs match. Each singleton's best match is the
    closest centroid, then the largest cluster.

    `flush_rows` caps how many candidate rows accumulate before the running best is
    reduced (a memory bound); it never changes the result.

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

    # Singleton members with their sequences (length precomputed once for the band prefilter)
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
        .with_columns(pl.col("member_seq").str.len_chars().cast(pl.Int64).alias("member_len"))
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
    rep_dtype = non_singleton_centroids.schema["rep_size"]

    n_singletons = singleton_df.height
    n_centroids = centroid_df.height
    print(f"Singleton reassignment: checking {n_singletons} singletons against {n_centroids} centroids...")

    max_dist_frac = 1.0 - min_seq_id

    def select_best(matches):
        # Closest centroid (lowest normalized distance), then largest cluster; one row per singleton.
        return (matches.sort(["norm_dist", "rep_size"], descending=[False, True])
                .group_by("member_key").first()
                .select("member_key", "clusterId", "rep_size", "distance", "norm_dist"))

    best = None
    pending = []
    pending_rows = 0
    for c in centroid_df.iter_rows(named=True):
        c_seq = c["centroid_seq"]
        Lc = len(c_seq)
        if Lc == 0:
            continue  # empty centroid can only "match" empty singletons (excluded by max_len>0)

        # (1) length-band prefilter (exact necessary condition; can only over-keep).
        band = singleton_df.filter(
            (pl.col("member_len") - Lc).abs().cast(pl.Float64)
            <= max_dist_frac * pl.max_horizontal(pl.col("member_len"), pl.lit(Lc)).cast(pl.Float64)
        )
        if band.height == 0:
            continue

        # (2) generous bounded prefilter: bound = largest allowed edits over the band, so it
        # never drops a real match; a few extras are removed by the exact recheck below.
        max_len_band = int(band.select(pl.col("member_len").max()).item())
        bound = int(math.floor(max_dist_frac * max(max_len_band, Lc)))
        pref = band.filter(pds.filter_by_levenshtein("member_seq", pl.lit(c_seq), bound, parallel=True))
        if pref.height == 0:
            continue

        # (3) exact normalized recheck.
        exact = pref.with_columns(
            pds.str_leven(pl.col("member_seq"), pl.lit(c_seq), return_sim=False).alias("distance"),
            pl.max_horizontal(pl.col("member_len"), pl.lit(Lc)).alias("max_len"),
        ).filter(
            (pl.col("max_len") > 0) &
            (pl.col("distance").cast(pl.Float64) / pl.col("max_len").cast(pl.Float64) <= max_dist_frac)
        )
        if exact.height == 0:
            continue

        cur = exact.with_columns(
            (pl.col("distance").cast(pl.Float64) / pl.col("max_len").cast(pl.Float64)).alias("norm_dist"),
            pl.lit(c["clusterId"]).alias("clusterId"),
            pl.lit(c["rep_size"], dtype=rep_dtype).alias("rep_size"),
        ).select("member_key", "clusterId", "rep_size", "distance", "norm_dist")
        pending.append(cur)
        pending_rows += cur.height
        if pending_rows >= flush_rows:
            best = select_best(pl.concat(([best] if best is not None else []) + pending))
            pending, pending_rows = [], 0
    if pending:
        best = select_best(pl.concat(([best] if best is not None else []) + pending))

    if best is None or best.height == 0:
        print(f"Singleton reassignment: 0 of {n_singletons} singletons matched "
              f"any non-singleton centroid (min-seq-id={min_seq_id})")
        return clusters

    best_matches = best

    # Log reassignments (first 10)
    for row in best_matches.head(10).iter_rows(named=True):
        print(f"  reassign {row['member_key']} -> centroid {row['clusterId']} "
              f"(dist={row['distance']}, norm_dist={row['norm_dist']:.4f}, "
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
