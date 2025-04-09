import argparse
import pandas as pd
import numpy as np
import scanpy as sc
import umap
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
    result = parasail.nw_trace_scan_16(seq1, seq2, parasail.blosum62)
    return -result.score  # Negative score to treat as distance

def select_metric_function(metric_name):
    if metric_name == "levenshtein":
        return compute_levenshtein
    elif metric_name == "alignment":
        return compute_alignment
    else:
        raise ValueError(f"Unsupported metric {metric_name}")

# ---------------------- Main script ---------------------- #

def main(input_file, seq_column, output_clusters, output_umap, output_tsne, metric, resolution, chain):

    # Load data
    df = pd.read_csv(input_file)

    # Rename columns
    df = df.rename(columns={"Clonotype key": "clonotype_id", "SC Clonotype key": "clonotype_id"})

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
        df.replace(np.nan, '', inplace=True)
        sequences = df.apply(lambda x: (x.get("cdr3_heavy", "") or "") + (x.get("cdr3_light", "") or ""), axis=1)
        sequences = sequences.replace('', np.nan).dropna()

    else:
        raise ValueError("Input CSV format not recognized. Unexpected number of chain columns")

    clonotype_ids = df.loc[sequences.index, "clonotype_id"]

    dropped = len(df) - len(sequences)
    if dropped > 0:
        print(f"Warning: Dropped {dropped} entries with missing CDR3 sequences.")

    print(f"Number of sequences after filtering: {len(sequences)}")

    n_sequences = len(sequences)
    n_neighbors = max(5, min(20, n_sequences // 100))
    print(f"Setting n_neighbors to {n_neighbors} based on {n_sequences} sequences.")

    # Compute UMAP directly with custom distance
    metric_function = select_metric_function(metric)

    print(f"Computing UMAP with {metric} metric...")
    umap_model = umap.UMAP(
        metric=lambda x, y: metric_function(x[0], y[0]),
        n_neighbors=n_neighbors,
        random_state=42
    )
    X_umap = umap_model.fit_transform(sequences.values.reshape(-1, 1))

    # Compute tSNE
    print("Running tSNE...")
    tsne_model = sc.tl.tsne(sc.AnnData(X=np.zeros((len(sequences), 1))), random_state=42, copy=True)
    X_tsne = tsne_model.obsm["X_tsne"]

    # Cluster using UMAP graph
    print("Building kNN graph for clustering...")
    adata = sc.AnnData(X=X_umap)
    adata.obs["clonotype_id"] = clonotype_ids.values
    sc.pp.neighbors(adata, use_rep="X", n_neighbors=n_neighbors)

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
        "UMAP_1": X_umap[:, 0],
        "UMAP_2": X_umap[:, 1],
    })
    umap_df.to_csv(output_umap, index=False)

    tsne_df = pd.DataFrame({
        "clonotype_id": adata.obs["clonotype_id"].values,
        "tSNE_1": X_tsne[:, 0],
        "tSNE_2": X_tsne[:, 1],
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
