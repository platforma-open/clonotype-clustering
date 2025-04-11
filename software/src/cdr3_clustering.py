import argparse
import pandas as pd
import numpy as np
import scanpy as sc
from sklearn.neighbors import NearestNeighbors
from scipy.sparse import csr_matrix
from joblib import Parallel, delayed
import parasail
from rapidfuzz.distance import Levenshtein
from tqdm import tqdm
import warnings
import json

warnings.filterwarnings("ignore", category=FutureWarning)

# ---------------------- Helper functions ---------------------- #

def compute_levenshtein(seq1, seq2):
    return Levenshtein.distance(seq1, seq2)

def compute_alignment(seq1, seq2):
    # Global alignment with BLOSUM62, normalized
    result = parasail.nw_trace_scan_16(seq1, seq2, 10, 1, parasail.blosum62)
    score = result.score
    max_len = max(len(seq1), len(seq2))
    max_score = max_len * parasail.blosum62.max
    normalized_score = score / max_score if max_score != 0 else 0
    distance = 1 - normalized_score  # 0 = identical, 1 = maximally different
    return distance

def build_distance_matrix(sequences, metric, n_jobs=-1):
    n = len(sequences)
    dist_matrix = np.zeros((n, n))
    
    def compute_row(i):
        row = np.zeros(n)
        for j in range(i):
            if metric == "levenshtein":
                row[j] = compute_levenshtein(sequences[i], sequences[j])
            elif metric == "alignment":
                row[j] = compute_alignment(sequences[i], sequences[j])
        return i, row

    results = Parallel(n_jobs=n_jobs)(delayed(compute_row)(i) for i in tqdm(range(n)))
    
    for i, row in results:
        dist_matrix[i, :i] = row[:i]
    
    dist_matrix = dist_matrix + dist_matrix.T
    np.fill_diagonal(dist_matrix, 0)
    return dist_matrix

# ---------------------- Main script ---------------------- #

def main(input_file, seq_column, output_clusters, output_umap, output_tsne, metric, resolution, chain):

    # Load data
    df = pd.read_csv(input_file)

    # Rename columns dynamically
    df = df.rename(columns={"Clonotype key": "clonotype_id",
                            "SC Clonotype key": "clonotype_id",
                            "Clone label": "clonotype_id"})
    renameDict = {}
    for colname in seq_column:
        if 'heavy' in colname.lower():
            renameDict[colname] = "cdr3_heavy"
        elif 'light' in colname.lower():
            renameDict[colname] = "cdr3_light"
        elif colname == "CDR3 aa":
            renameDict[colname] = "cdr3"
        else:
            raise ValueError(f"Invalid input columns: {', '.join(colname)}")
    df = df.rename(columns=renameDict)
    allColumns = list(renameDict.values())

    # Auto-set default chain
    if chain is None:
        if len(allColumns) == 2:
            chain = "both"
        else:
            chain = "heavy"
            print("⚠️ Only one chain column provided. Defaulting to heavy chain (use --chain light to override).")

    # Prepare sequences
    if chain == "both":
        if len(allColumns) != 2:
            raise ValueError("Both chains selected but only one chain column provided.")
        df.replace(np.nan, '', inplace=True)
        sequences = df.apply(lambda x: (x["cdr3_heavy"] or "") + (x["cdr3_light"] or ""), axis=1)
    elif chain == "heavy":
        if "cdr3_heavy" in df.columns:
            sequences = df["cdr3_heavy"]
        elif "cdr3" in df.columns:
            sequences = df["cdr3"]  # ⭐ Bulk support: use "cdr3" if no "cdr3_heavy"
        else:
            raise ValueError("Heavy chain data not found.")
    elif chain == "light":
        sequences = df["cdr3_light"]
    else:
        raise ValueError(f"Invalid chain: {chain}")

    sequences = sequences.replace('', np.nan).dropna()
    clonotype_ids = df.loc[sequences.index, "clonotype_id"]

    # Warn about missing sequences
    dropped = len(df) - len(sequences)
    if dropped > 0:
        print(f"Warning: Dropped {dropped} entries with missing CDR3 sequences.")

    print(f"Number of sequences after filtering: {len(sequences)}")

    # Adjust n_neighbors dynamically
    n_sequences = len(sequences)
    n_neighbors = max(5, min(20, n_sequences // 100))
    print(f"Setting n_neighbors to {n_neighbors} based on {n_sequences} sequences.")

    # Compute distance matrix
    print(f"Computing {metric} distance matrix for {n_sequences} sequences...")
    dist_matrix = build_distance_matrix(sequences.tolist(), metric=metric)

    # Create AnnData object
    adata = sc.AnnData(X=dist_matrix)
    adata.obs["clonotype_id"] = clonotype_ids.values

    # Build neighbors manually
    print("Building kNN graph manually...")
    nbrs = NearestNeighbors(n_neighbors=n_neighbors, metric="precomputed").fit(dist_matrix)
    knn_graph = nbrs.kneighbors_graph(dist_matrix, mode="connectivity")
    adata.obsp["connectivities"] = csr_matrix(knn_graph)

    # ✨ Manually fill .uns["neighbors"]
    adata.uns["neighbors"] = {
        "connectivities_key": "connectivities",
        "distances_key": "connectivities",
        "params": {
            "n_neighbors": n_neighbors,
            "method": "manual",
            "metric": "precomputed",
        }
    }

    # Dimensionality reduction
    print("Running UMAP...")
    sc.tl.umap(adata)

    print("Running tSNE...")
    sc.tl.tsne(adata)

    # Clustering
    print("Running Leiden clustering...")
    sc.tl.leiden(adata, resolution=resolution)

    # Save outputs
    clusters_df = pd.DataFrame({
        "clonotype_id": adata.obs["clonotype_id"].values,
        "cluster": adata.obs["leiden"].values
    })
    clusters_df.to_csv(output_clusters, index=False)

    umap_df = pd.DataFrame({
        "clonotype_id": adata.obs["clonotype_id"].values,
        "UMAP_1": adata.obsm["X_umap"][:, 0],
        "UMAP_2": adata.obsm["X_umap"][:, 1],
    })
    umap_df.to_csv(output_umap, index=False)

    tsne_df = pd.DataFrame({
        "clonotype_id": adata.obs["clonotype_id"].values,
        "tSNE_1": adata.obsm["X_tsne"][:, 0],
        "tSNE_2": adata.obsm["X_tsne"][:, 1],
    })
    tsne_df.to_csv(output_tsne, index=False)

    # ➡️ Save global cluster metrics (ADDED BELOW ONLY)
    print("Saving global cluster summary metrics...")
    cluster_sizes = clusters_df["cluster"].value_counts()

    metrics = {
        "Total Clonotypes": len(clusters_df),
        "Total Clusters": cluster_sizes.shape[0],
        "Average Cluster Size": round(cluster_sizes.mean(), 2),
        "Median Cluster Size": cluster_sizes.median(),
        "Min Cluster Size": cluster_sizes.min(),
        "Max Cluster Size": cluster_sizes.max(),
        "Std Cluster Size": round(cluster_sizes.std(), 2),
        "Clusters with 1 Clonotype": (cluster_sizes == 1).sum(),
    }

    metrics_df = pd.DataFrame(list(metrics.items()), columns=["Metric", "Value"])
    metrics_df.to_csv("cluster_summary_metrics.csv", index=False)

    print("✅ Clustering, dimensionality reduction, and summary metrics completed successfully.")

# ---------------------- Argument parsing ---------------------- #

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cluster CDR3 sequences based on Levenshtein or Alignment distances.")
    parser.add_argument("--input", required=True, help="Input CSV file")
    parser.add_argument("--seq_column", required=True, help="Json string with list of columns with sequence information")
    parser.add_argument("--output_clusters", required=True, help="Output CSV with cluster assignments")
    parser.add_argument("--output_umap", required=True, help="Output CSV with UMAP coordinates")
    parser.add_argument("--output_tsne", required=True, help="Output CSV with tSNE coordinates")
    parser.add_argument("--metric", default="alignment", choices=["alignment", "levenshtein"], help="Distance metric to use")
    parser.add_argument("--resolution", type=float, default=1.0, help="Resolution parameter for Leiden clustering")
    parser.add_argument("--chain", default=None, choices=["both", "heavy", "light"], help="Which chains to use (both/heavy/light)")
    args = parser.parse_args()

    main(
        input_file=args.input,
        seq_column=json.loads(args.seq_column),
        output_clusters=args.output_clusters,
        output_umap=args.output_umap,
        output_tsne=args.output_tsne,
        metric=args.metric,
        resolution=args.resolution,
        chain=args.chain,
    )
