"""Regression tests for reassign_singletons.

Each case builds small `clusters` / `cloneTable` frames whose correct outcome is
known by construction, so the tests need no large data.

Contract under test:
  - a singleton within (1 - min_seq_id) normalized Levenshtein of a non-singleton
    cluster's representative is reassigned to it;
  - among several qualifying clusters, the CLOSEST wins; ties break toward the
    LARGER cluster;
  - singletons matching nothing stay as-is; degenerate inputs are no-ops.
"""
from __future__ import annotations

import random

import polars as pl
import pytest

from reassign_singletons import reassign_singletons

MIN_SEQ_ID = 0.8  # allow up to 20% differences

# --- reference sequences (length 12 -> up to 2 edits pass 0.8 identity) --------
BASE = "CASSLGETQYFW"
A1 = "CASSLAETQYFW"   # 1 edit from BASE (pos 5 G->A)
A2 = "CDSSLGETQYFW"   # 1 edit from BASE (pos 1 A->D)  -- different position
FAR2 = "CASSLAETQKKW"  # 2 edits from A1 (pos 9,10)   -- used as a farther centroid
FAR = "KKKKKKKKKKKK"   # every position differs from BASE -> never matches


def build_frames(buckets, singletons):
    """buckets: [(rep_key, seq, size)]; singletons: [(key, seq)].

    Produces (clusters, cloneTable) shaped like the real pipeline inputs:
    a bucket contributes `size` rows to `clusters` (representative + members),
    the representative's sequence is what reassignment compares against.
    """
    cl_cluster, cl_clone, ct_key, ct_seq = [], [], [], []
    for rep_key, seq, size in buckets:
        cl_cluster.append(rep_key)
        cl_clone.append(rep_key)
        ct_key.append(rep_key)
        ct_seq.append(seq)
        for i in range(size - 1):
            mk = f"{rep_key}_m{i}"
            cl_cluster.append(rep_key)
            cl_clone.append(mk)
            ct_key.append(mk)
            ct_seq.append(seq)
    for key, seq in singletons:
        cl_cluster.append(key)
        cl_clone.append(key)
        ct_key.append(key)
        ct_seq.append(seq)
    clusters = pl.DataFrame({"clusterId": cl_cluster, "clonotypeKey": cl_clone})
    cloneTable = pl.DataFrame({"clonotypeKey": ct_key, "trimmed_fullSequence": ct_seq})
    return clusters, cloneTable


def cluster_of(result: pl.DataFrame, key: str) -> str:
    """Which clusterId a given clonotypeKey ended up in."""
    return result.filter(pl.col("clonotypeKey") == key)["clusterId"].to_list()[0]


def test_near_singleton_is_reassigned():
    clusters, cloneTable = build_frames(
        buckets=[("REP_BASE", BASE, 2)],
        singletons=[("SNG", A1)],  # 1 edit from BASE -> norm 1/12 ~= 0.083 <= 0.2
    )
    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID)
    assert cluster_of(out, "SNG") == "REP_BASE"


def test_far_singleton_is_kept():
    clusters, cloneTable = build_frames(
        buckets=[("REP_BASE", BASE, 2)],
        singletons=[("SNG", FAR)],  # every position differs -> norm 1.0 > 0.2
    )
    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID)
    assert cluster_of(out, "SNG") == "SNG"  # unchanged


def test_closest_cluster_wins_over_distance():
    # SNG=A1 is 1 edit from REP_BASE and 2 edits from REP_FAR2 (both within 0.2).
    # REP_FAR2 is the far bigger cluster, but distance is primary -> REP_BASE wins.
    clusters, cloneTable = build_frames(
        buckets=[("REP_BASE", BASE, 2), ("REP_FAR2", FAR2, 10)],
        singletons=[("SNG", A1)],
    )
    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID)
    assert cluster_of(out, "SNG") == "REP_BASE"


def test_larger_cluster_breaks_distance_tie():
    # SNG=BASE is exactly 1 edit from both reps (equal distance) -> tie broken by size.
    clusters, cloneTable = build_frames(
        buckets=[("REP_SMALL", A1, 2), ("REP_BIG", A2, 5)],
        singletons=[("SNG", BASE)],
    )
    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID)
    assert cluster_of(out, "SNG") == "REP_BIG"


def test_equal_distance_equal_size_tie_breaks_on_clusterid():
    # SNG=BASE is 1 edit from each rep (A1 at pos 5, A2 at pos 1) and both clusters are
    # size 2 -> equal norm_dist AND equal rep_size. Must deterministically pick the
    # smaller clusterId ("REP_A"), regardless of the order the buckets are supplied.
    for order in ([("REP_A", A1, 2), ("REP_B", A2, 2)],
                  [("REP_B", A2, 2), ("REP_A", A1, 2)]):
        clusters, cloneTable = build_frames(buckets=order, singletons=[("SNG", BASE)])
        out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID)
        assert cluster_of(out, "SNG") == "REP_A"


def test_mixed_batch_of_singletons():
    clusters, cloneTable = build_frames(
        buckets=[("REP_BASE", BASE, 3)],
        singletons=[("NEAR", A1), ("FARAWAY", FAR)],
    )
    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID)
    assert cluster_of(out, "NEAR") == "REP_BASE"
    assert cluster_of(out, "FARAWAY") == "FARAWAY"


def test_no_singletons_is_noop():
    clusters, cloneTable = build_frames(
        buckets=[("REP_BASE", BASE, 2), ("REP_A2", A2, 3)],
        singletons=[],
    )
    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID)
    assert out.sort("clonotypeKey").equals(clusters.sort("clonotypeKey"))


def test_no_non_singleton_clusters_is_noop():
    clusters, cloneTable = build_frames(
        buckets=[],
        singletons=[("S1", BASE), ("S2", A1)],
    )
    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID)
    assert out.sort("clonotypeKey").equals(clusters.sort("clonotypeKey"))


def test_no_sequence_column_is_noop():
    clusters = pl.DataFrame({"clusterId": ["c1", "c1", "s1"],
                             "clonotypeKey": ["c1", "c1_m", "s1"]})
    cloneTable = pl.DataFrame({"clonotypeKey": ["c1", "c1_m", "s1"]})  # no seq column
    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID)
    assert out.sort("clonotypeKey").equals(clusters.sort("clonotypeKey"))


@pytest.mark.slow
def test_scaled_matching_flows_through_all_stages_and_flush():
    """At scale, with real matches driving every stage and the flush/reduction path.

    200 families, each a centroid plus 10 singleton variants that are 1 edit from the
    family base (same length, so the length band admits them). Every singleton matches
    its own family's centroid, so ~2000 candidates flow through filter_by_levenshtein,
    the exact recheck, and accumulation into `pending`; a small `flush_rows` forces
    several reductions. Asserts each singleton is reassigned to its own family.
    """
    rng = random.Random(0)
    aa = "ACDEFGHIKLMNPQRSTVWY"
    L, n_families, per_family = 12, 200, 10

    def rseq():
        return "".join(rng.choice(aa) for _ in range(L))

    def one_edit(seq):
        i = rng.randrange(L)
        repl = rng.choice(aa)
        while repl == seq[i]:
            repl = rng.choice(aa)
        return seq[:i] + repl + seq[i + 1:]

    buckets, singletons, expected = [], [], {}
    for f in range(n_families):
        base = rseq()
        buckets.append((f"C{f}", base, 2))
        for k in range(per_family):
            key = f"S{f}_{k}"
            singletons.append((key, one_edit(base)))
            expected[key] = f"C{f}"
    clusters, cloneTable = build_frames(buckets, singletons)

    # small flush_rows -> the 2000 matches trigger several running-best reductions
    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID, flush_rows=500)

    assert out.height == clusters.height
    assign = dict(zip(out["clonotypeKey"].to_list(), out["clusterId"].to_list()))
    for key, want in expected.items():
        assert assign[key] == want


@pytest.mark.parametrize("flush_rows", [1, 7, 25, 101, 10**9])
def test_pending_overflow_reduction_is_correct(flush_rows):
    """Force the flush_rows reduction branch on tiny input and confirm the result is
    unchanged across thresholds.

    Construction: 10 singletons and 10 buckets, where SNG_i is 1 edit from REP_i and
    2 edits from every other REP_j (all within 0.2), so each singleton matches ALL 10
    buckets -> ~100 candidate rows, and the unique closest for SNG_i is REP_i.
    With flush_rows=1 the running best is reduced after every matching bucket (many
    flushes); with flush_rows=1e9 it is reduced once at the end. Both -- and every value
    between -- must yield the same, correct SNG_i -> REP_i mapping.
    """
    n = 10  # positions 0..9 within the length-12 BASE

    def sub(seq, pos, ch):
        return seq[:pos] + ch + seq[pos + 1:]

    # 'W'/'H' don't occur in BASE[0:10], so every edit is a real 1-char change and
    # singleton vs centroid edits never coincide.
    buckets = [(f"REP{j}", sub(BASE, j, "H"), 2) for j in range(n)]
    singletons = [(f"SNG{i}", sub(BASE, i, "W")) for i in range(n)]
    clusters, cloneTable = build_frames(buckets, singletons)

    out = reassign_singletons(clusters, cloneTable, MIN_SEQ_ID, flush_rows=flush_rows)
    for i in range(n):
        assert cluster_of(out, f"SNG{i}") == f"REP{i}"
