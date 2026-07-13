"""Singleton reassignment for high-precision clustering.

MMseqs2's k-mer prefilter (k=5) misses valid matches for short sequences (5-7 aa),
leaving them as false singletons. This folds each singleton into the nearest
non-singleton cluster whose representative is within the identity threshold.

The old all-pairs cross join overflowed polars' 2^32 row cap on large repertoires.
Instead this walks centroids one at a time through a three-stage funnel, keeping
only a running best-per-singleton, so peak memory is O(#singletons).
"""
import math

import polars as pl
import polars_ds as pds

# Preferred first: the trimmed sequence wins over untrimmed when both exist.
SEQ_COLUMNS = ("trimmed_fullSequence", "fullSequence")

# Memory bound only: candidate rows accumulated before reducing to the running
# best. The result is identical for any value (see _RunningBest).
FLUSH_ROWS = 2_000_000


def reassign_singletons(clusters: pl.DataFrame, cloneTable: pl.DataFrame,
                        min_seq_id: float, flush_rows: int = FLUSH_ROWS) -> pl.DataFrame:
    """Fold singleton clusters into a near-enough non-singleton cluster.

    A singleton is reassigned to the centroid within `1 - min_seq_id` normalized
    Levenshtein distance, preferring the closest, then the largest, then the
    lowest-id cluster. Returns `clusters` with `clusterId` updated in place; a
    no-op (with an explanatory print) when there is nothing to reassign.
    """
    seq_col = next((c for c in SEQ_COLUMNS if c in cloneTable.columns), None)
    if seq_col is None:
        print("Singleton reassignment: skipped (no sequence columns available)")
        return clusters

    singletons, centroids = _split_by_size(clusters, cloneTable, seq_col)
    if singletons.height == 0 or centroids.height == 0:
        why = "no singletons" if singletons.height == 0 else "no non-singleton clusters to reassign to"
        print(f"Singleton reassignment: skipped ({why})")
        return clusters

    print(f"Singleton reassignment: checking {singletons.height} singletons "
          f"against {centroids.height} centroids...")

    best = _best_match_per_singleton(singletons, centroids, 1.0 - min_seq_id, flush_rows)
    if best.height == 0:
        print(f"Singleton reassignment: 0 of {singletons.height} singletons matched "
              f"any non-singleton centroid (min-seq-id={min_seq_id})")
        return clusters

    _log_reassignments(best)
    print(f"Singleton reassignment: {best.height} of {singletons.height} singletons "
          f"reassigned to existing clusters (min-seq-id={min_seq_id})")
    return _apply_reassignments(clusters, best)


def _split_by_size(clusters: pl.DataFrame, cloneTable: pl.DataFrame,
                   seq_col: str) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Split representatives into singletons and centroids, joined to their sequence.

    A cluster's representative is the clonotype whose key equals the clusterId.
    Returns (singletons[member_key, member_seq, member_len],
             centroids[clusterId, rep_size, centroid_seq]).
    """
    seq = cloneTable.select("clonotypeKey", seq_col).unique("clonotypeKey", keep="first")
    rep_size = clusters.group_by("clusterId").agg(pl.len().alias("rep_size"))

    singletons = (
        clusters.join(rep_size.filter(pl.col("rep_size") == 1).select("clusterId"),
                      on="clusterId", how="semi")
        .join(seq, on="clonotypeKey", how="inner")
        .select(
            pl.col("clonotypeKey").alias("member_key"),
            pl.col(seq_col).alias("member_seq"),
            pl.col(seq_col).str.len_chars().cast(pl.Int64).alias("member_len"),
        )
    )
    centroids = (
        rep_size.filter(pl.col("rep_size") > 1)
        .join(seq.rename({"clonotypeKey": "clusterId", seq_col: "centroid_seq"}),
              on="clusterId", how="inner")
    )
    return singletons, centroids


def _best_match_per_singleton(singletons: pl.DataFrame, centroids: pl.DataFrame,
                              max_dist_frac: float, flush_rows: int) -> pl.DataFrame:
    """Best qualifying centroid per singleton, or an empty frame if none match."""
    # Loop-invariant upper bound for the per-centroid prefilter (see _match_centroid).
    max_len_all = int(singletons.select(pl.col("member_len").max()).item())
    rep_dtype = centroids.schema["rep_size"]

    running = _RunningBest(flush_rows)
    for centroid in centroids.iter_rows(named=True):
        if (candidates := _match_centroid(singletons, centroid, max_dist_frac,
                                          max_len_all, rep_dtype)) is not None:
            running.add(candidates)
    return running.result()


def _match_centroid(singletons: pl.DataFrame, centroid: dict, max_dist_frac: float,
                    max_len_all: int, rep_dtype: pl.DataType) -> pl.DataFrame | None:
    """Singletons matching one centroid, or None if none do.

    Three stages, each only over-keeps relative to the next, so survivors are exactly
    the pairs the old cross-join-then-filter produced:
      (1) length band       -- a match needs |Ls - Lc| <= frac * max(Ls, Lc);
      (2) bounded Levenshtein -- generous prefilter, early-exiting, no full matrix;
      (3) exact recheck      -- distance / max_len <= frac.
    """
    centroid_seq = centroid["centroid_seq"]
    centroid_len = len(centroid_seq)
    if centroid_len == 0:
        return None  # empty centroid only matches empty singletons, dropped by max_len > 0

    band = singletons.filter(
        (pl.col("member_len") - centroid_len).abs()
        <= max_dist_frac * pl.max_horizontal("member_len", pl.lit(centroid_len))
    )
    if band.height == 0:
        return None

    # bound uses max_len_all (>= this pair's max_len), so it never drops a true match.
    # polars_ds 0.10.2 reads a bare str as a column name -> the centroid must be pl.lit.
    bound = math.floor(max_dist_frac * max(max_len_all, centroid_len))
    pref = band.filter(pds.filter_by_levenshtein("member_seq", pl.lit(centroid_seq), bound, parallel=True))
    if pref.height == 0:
        return None

    matched = (
        pref.with_columns(
            pds.str_leven("member_seq", pl.lit(centroid_seq), return_sim=False).alias("distance"),
            pl.max_horizontal("member_len", pl.lit(centroid_len)).alias("max_len"),
        )
        .with_columns((pl.col("distance") / pl.col("max_len")).alias("norm_dist"))
        .filter((pl.col("max_len") > 0) & (pl.col("norm_dist") <= max_dist_frac))
    )
    if matched.height == 0:
        return None

    return matched.select(
        "member_key",
        pl.lit(centroid["clusterId"]).alias("clusterId"),
        pl.lit(centroid["rep_size"], dtype=rep_dtype).alias("rep_size"),
        "distance",
        "norm_dist",
    )


class _RunningBest:
    """Running best match per singleton, without holding every candidate.

    Candidates accumulate until they exceed flush_rows, then collapse to one row per
    singleton. Chunked reduction equals a single reduction because the ranking key is
    a strict total order and each singleton matches a given cluster at most once.
    """

    def __init__(self, flush_rows: int):
        self._flush_rows = flush_rows
        self._best = None
        self._pending = []
        self._pending_rows = 0

    def add(self, candidates: pl.DataFrame) -> None:
        self._pending.append(candidates)
        self._pending_rows += candidates.height
        if self._pending_rows >= self._flush_rows:
            self._reduce()

    def result(self) -> pl.DataFrame:
        self._reduce()
        return self._best if self._best is not None else pl.DataFrame()

    def _reduce(self) -> None:
        if not self._pending:
            return
        frames = self._pending if self._best is None else [self._best, *self._pending]
        self._best = _pick_best(pl.concat(frames))
        self._pending, self._pending_rows = [], 0


def _pick_best(candidates: pl.DataFrame) -> pl.DataFrame:
    """One row per singleton: closest centroid, then largest, then lowest clusterId."""
    return (
        candidates
        .sort(["norm_dist", "rep_size", "clusterId"], descending=[False, True, False])
        .group_by("member_key").first()
    )


def _log_reassignments(best: pl.DataFrame, limit: int = 10) -> None:
    # Sort for a stable log sample (group_by output order is not deterministic);
    # closest reassignments first.
    shown = best.sort(["norm_dist", "member_key"])
    for row in shown.head(limit).iter_rows(named=True):
        print(f"  reassign {row['member_key']} -> centroid {row['clusterId']} "
              f"(dist={row['distance']}, norm_dist={row['norm_dist']:.4f}, "
              f"cluster_size={row['rep_size']})")
    if best.height > limit:
        print(f"  ... and {best.height - limit} more reassignments")


def _apply_reassignments(clusters: pl.DataFrame, best: pl.DataFrame) -> pl.DataFrame:
    """Point every reassigned singleton's rows at its new clusterId."""
    reassign = best.select("member_key", pl.col("clusterId").alias("new_clusterId"))
    return (
        clusters
        .join(reassign, left_on="clonotypeKey", right_on="member_key", how="left")
        .with_columns(pl.coalesce("new_clusterId", "clusterId").alias("clusterId"))
        .drop("new_clusterId")
    )
