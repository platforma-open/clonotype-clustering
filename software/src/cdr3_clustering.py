import argparse
import pandas as pd
import numpy as np
import scanpy as sc
import umap
from sklearn.neighbors import NearestNeighbors
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
    # Use global alignment with BLOSUM62
    result = parasail.nw_trace_scan_16(seq1, seq2, parasail.blosum62)
    return -result.score  # Negative score to treat as distance

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
    return dist_matrix

# ---------------------- Main script ---------------------- #

def main(input_file, seq_column, output_clusters, output_umap, output_tsne, metric, resolution, chain):

    # Load data
    df = pd.read_csv(input_file)
    
    # rename columns
    ## First Id
    df = df.rename(columns={"Clonotype key": "clonotype_id"})
    ## Then additional columns
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

    # Apply filters
    if len(allColumns) == 1:
        colname = allColumns[0]
        sequences = df[colname].dropna()

    elif len(allColumns) == 2:
        sequences = df.apply(lambda x: (x["cdr3_heavy"] or "") + (x["cdr3_light"] or ""), axis=1)
        sequences = sequences.replace('', np.nan).dropna()

    else:
        raise ValueError("Input CSV format not recognized. Unexpected number of chain columns")
    
    clonotype_ids = df.loc[sequences.index, "clonotype_id"]


    # Warn about missing sequences
    dropped = len(df) - len(sequences)
    if dropped > 0:
        print(f"Warning: Dropped {dropped} entries with missing CDR3 sequences.")

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

    # ⚡ Build neighbors graph properly
    print("Building kNN graph...")
    sc.pp.neighbors(adata, use_rep="X", metric="precomputed", n_neighbors=n_neighbors)

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

    print("✅ Clustering and dimensionality reduction completed successfully.")

# ---------------------- Argument parsing ---------------------- #

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cluster CDR3 sequences based on Levenshtein or Alignment distances.")
    parser.add_argument("--input", required=True, help="Input CSV file")
    parser.add_argument("--seq_column", required=True, help="Json string with a list of the names of the columns with the sequence information")
    parser.add_argument("--output_clusters", required=True, help="Output CSV with cluster assignments")
    parser.add_argument("--output_umap", required=True, help="Output CSV with UMAP coordinates")
    parser.add_argument("--output_tsne", required=True, help="Output CSV with tSNE coordinates")
    parser.add_argument("--metric", default="alignment", choices=["alignment", "levenshtein"], help="Distance metric to use")
    parser.add_argument("--resolution", type=float, default=1.0, help="Resolution parameter for Leiden clustering")
    parser.add_argument("--chain", default="both", choices=["both", "heavy", "light"], help="For single-cell data, which chains to use")
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
