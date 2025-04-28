import pandas as pd

clustersTsv = "clusters.tsv"
cloneTableTsv = "cloneTable.tsv"
clusterToSeqTsv = "cluster-to-seq.tsv"
cloneToClusterTsv = "clone-to-cluster.tsv"
abundancesTsv = "abundances.tsv"

# sampleId, clonotypeKey, aaCDR3, VGene, JGene
cloneTable = pd.read_csv(cloneTableTsv, sep="\t")

# clusterId, clonotypeKey
clusters = pd.read_csv(clustersTsv, sep="\t", header=None, names=["clusterId", "clonotypeKey"])

# --- Calculate cluster sizes directly in the clusters dataframe ---
clusters['size'] = clusters.groupby('clusterId')['clonotypeKey'].transform('size')

# --- Generate cluster-to-seq.tsv ---
# Get unique cluster centroids with their size
unique_centroids_with_size = clusters[['clusterId', 'size']].drop_duplicates()

# Merge cloneTable with unique centroids+size to get sequences and size for centroids
# Use inner join: clusterId (from unique_centroids_with_size) must match clonotypeKey (from cloneTable)
centroid_data = pd.merge(
    cloneTable,
    unique_centroids_with_size,
    left_on='clonotypeKey',
    right_on='clusterId',
    how='inner'
)

required_cols_cts = ['clusterId', 'clonotypeKeyLabel', 'aaCDR3', 'size']
if 'aaCDR3_second' in cloneTable.columns:
    required_cols_cts.append('aaCDR3_second')

# Select necessary columns and ensure uniqueness by clusterId
cluster_to_seq = centroid_data[required_cols_cts].drop_duplicates(subset=['clusterId'])

# Write cluster-to-seq.tsv
cluster_to_seq.to_csv(clusterToSeqTsv, sep="\t", index=False)


# --- Generate clone-to-cluster.tsv ---
clone_to_cluster = clusters[['clusterId', 'clonotypeKey']].copy()
clone_to_cluster['link'] = 1
clone_to_cluster.to_csv(cloneToClusterTsv, sep="\t", index=False)


# --- Generate abundances.tsv ---
# Merge cloneTable and clusters (original, without size or just relevant columns) to link abundances to clusters
merged_abundances = pd.merge(cloneTable[['sampleId', 'clonotypeKey', 'abundance']], clusters[['clusterId', 'clonotypeKey']], on='clonotypeKey')

# Group by sample and cluster, summing abundances
cluster_abundances = merged_abundances.groupby(['sampleId', 'clusterId'])['abundance'].sum().reset_index()

# Write abundances.tsv
cluster_abundances.to_csv(abundancesTsv, sep="\t", index=False)