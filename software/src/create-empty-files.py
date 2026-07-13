import pandas as pd
import argparse

def main():
    parser = argparse.ArgumentParser(
        description='Create empty files with proper column headers for clustering results.',
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument('--num-sequences', type=int, default=0,
                        help='Number of sequence columns (default: 0)')
    parser.add_argument('--trim-start', type=int, default=0,
                        help='Number of amino acids to trim from start (default: 0)')
    parser.add_argument('--trim-end', type=int, default=0,
                        help='Number of amino acids to trim from end (default: 0)')
    parser.add_argument('--is-single-cell', action='store_true',
                        help='Whether this is single-cell data (affects trimmed column structure)')
    parser.add_argument('--emit-plurality-centroid', action='store_true',
                        help='Also emit a header-only plurality-centroid.tsv matching the real-run header '
                             '(per-cluster abundance-weighted per-column majority residue, no "X").')
    args = parser.parse_args()

    num_sequences = args.num_sequences

    # Build sequence column names
    sequence_cols = [f"sequence_{i}" for i in range(num_sequences)]
    # Always create per-chain trimmed columns (trim_sequence_*) regardless of trimming
    # When there's no trimming, they're just copies of originals, but they still exist
    trimmed_cols = [f"trim_sequence_{i}" for i in range(num_sequences)]

    # 1. abundances.tsv: sampleId, clusterId, abundance, abundance_normalized
    pd.DataFrame(columns=["sampleId", "clusterId", "abundance", "abundance_normalized"]).to_csv(
        "abundances.tsv", sep="\t", index=False
    )

    # 2. cluster-to-seq.tsv: clusterId, clusterLabel, size, sequence_*, trim_sequence_* (always), trimmed_fullSequence (if sequences exist)
    # process_results.py always includes all trimmed_cols and trimmed_fullSequence when sequences exist
    cluster_to_seq_cols = ["clusterId", "clusterLabel", "size"] + sequence_cols
    if num_sequences > 0:
        # Always include per-chain trimmed columns
        cluster_to_seq_cols.extend(trimmed_cols)
        # Always include trimmed_fullSequence
        cluster_to_seq_cols.append("trimmed_fullSequence")
        # Theoretical centroid (consensus) and reference centroid (medoid) columns: one
        # per sequence column and per trimmed column, plus the joined *_trimmed_fullSequence.
        cluster_to_seq_cols.extend([f"centroid_{c}" for c in sequence_cols])
        cluster_to_seq_cols.extend([f"reference_centroid_{c}" for c in sequence_cols])
        cluster_to_seq_cols.extend([f"centroid_{c}" for c in trimmed_cols])
        cluster_to_seq_cols.extend([f"reference_centroid_{c}" for c in trimmed_cols])
        cluster_to_seq_cols.append("centroid_trimmed_fullSequence")
        cluster_to_seq_cols.append("reference_centroid_trimmed_fullSequence")
    pd.DataFrame(columns=cluster_to_seq_cols).to_csv(
        "cluster-to-seq.tsv", sep="\t", index=False
    )

    # 3. clone-to-cluster.tsv: clusterId, clonotypeKey, clusterLabel, link
    pd.DataFrame(columns=["clusterId", "clonotypeKey", "clusterLabel", "link"]).to_csv(
        "clone-to-cluster.tsv", sep="\t", index=False
    )

    # 4. abundances-per-cluster.tsv: clusterId, abundance_per_cluster, abundance_fraction_per_cluster
    pd.DataFrame(columns=["clusterId", "abundance_per_cluster", "abundance_fraction_per_cluster"]).to_csv(
        "abundances-per-cluster.tsv", sep="\t", index=False
    )

    # 5. distance_to_centroid.tsv: clonotypeKey, clusterId, clonotypeKeyLabel, clusterLabel, distanceToCentroid
    pd.DataFrame(columns=["clonotypeKey", "clusterId", "clonotypeKeyLabel", "clusterLabel", "distanceToCentroid"]).to_csv(
        "distance_to_centroid.tsv", sep="\t", index=False
    )

    # 6. cluster-radius.tsv: clusterId, clusterRadius
    pd.DataFrame(columns=["clusterId", "clusterRadius"]).to_csv(
        "cluster-radius.tsv", sep="\t", index=False
    )

    # 7. cluster-to-seq-top.tsv: same as cluster-to-seq.tsv
    pd.DataFrame(columns=cluster_to_seq_cols).to_csv(
        "cluster-to-seq-top.tsv", sep="\t", index=False
    )

    # 8. cluster-radius-top.tsv: same as cluster-radius.tsv
    pd.DataFrame(columns=["clusterId", "clusterRadius"]).to_csv(
        "cluster-radius-top.tsv", sep="\t", index=False
    )

    # 9. abundances-top.tsv: same as abundances.tsv
    pd.DataFrame(columns=["sampleId", "clusterId", "abundance", "abundance_normalized"]).to_csv(
        "abundances-top.tsv", sep="\t", index=False
    )

    # 10. trimmed-sequences.tsv: clonotypeKey, trimmed_fullSequence, and all per-chain trimmed columns
    # process_results.py always includes trimmed_fullSequence and all trimmed_cols (per-chain columns)
    trimmed_seq_cols = ["clonotypeKey"]
    if num_sequences > 0:
        # Always include trimmed_fullSequence if we have sequences
        trimmed_seq_cols.append("trimmed_fullSequence")
        # Always include per-chain trimmed columns (they exist even without trimming, just as copies)
        trimmed_seq_cols.extend(trimmed_cols)
    pd.DataFrame(columns=trimmed_seq_cols).to_csv(
        "trimmed-sequences.tsv", sep="\t", index=False
    )

    # 11. plurality-centroid.tsv: clusterId, plurality_centroid_<trim_sequence_*>,
    # plurality_centroid_trimmed_fullSequence. Matches process_results.py's real-run header.
    # Always emitted (the clustering workflow always saveFiles/getFiles it); the
    # --emit-plurality-centroid flag only gates the expensive consensus computation in
    # process_results.py, not the file's existence.
    # clusterLabel = variantKey axis label; clusterIdLink + link feed the centroid-dataset linker
    # (variantKey <-> clusterId). Always present so the header matches process_results.py on empty runs.
    plurality_cols = ["clusterId", "clusterLabel", "peptideLabel", "clusterIdLink", "link"]
    if num_sequences > 0:
        plurality_cols.extend([f"plurality_centroid_{c}" for c in trimmed_cols])
        plurality_cols.append("plurality_centroid_trimmed_fullSequence")
        plurality_cols.extend([f"plurality_centroid_length_{c}" for c in trimmed_cols])
    pd.DataFrame(columns=plurality_cols).to_csv(
        "plurality-centroid.tsv", sep="\t", index=False
    )

    print("Created all empty files with proper column headers")


if __name__ == '__main__':
    main()