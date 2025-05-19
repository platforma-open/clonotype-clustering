import pandas as pd

clustersTsv = "clusters.tsv"
cloneTableTsv = "cloneTable.tsv"
clusterToSeqTsv = "cluster-to-seq.tsv"
cloneToClusterTsv = "clone-to-cluster.tsv"
abundancesTsv = "abundances.tsv"
abundancesPerClusterTsv = "abundances-per-cluster.tsv"

# sampleId, clonotypeKey, clonotypeKeyLabel,sequence_..., 
# sequence_second_...VGene, JGene
cloneTable = pd.read_csv(cloneTableTsv, sep="\t")

# Concatenate all sequence columns if we have them
sequence_cols = [col for col in cloneTable.columns 
                 if col.startswith('sequence_')]
cloneTable[sequence_cols] = cloneTable[sequence_cols].fillna('')
cloneTable['sequence'] = cloneTable[sequence_cols].agg(''.join, axis=1)

# If we got both chains merge by groups and then all together
sequence_cols = [col for col in cloneTable.columns 
                if col.startswith('sequence_second_')]
if len(sequence_cols) > 0:
    cloneTable['sequence_second'] = cloneTable[sequence_cols].agg(''.join, axis=1)

# Transform clonotypeKeyLabel from "C-XXXXXX" with "CL-XXXXXX"
cloneTable['clusterLabel'] = cloneTable['clonotypeKeyLabel'] \
    .str.replace('C-', 'CL-', n=1)

# clusterId, clonotypeKey
clusters = pd.read_csv(clustersTsv, sep="\t", header=None,
                       names=["clusterId", "clonotypeKey"])

# --- Calculate cluster sizes directly in the clusters dataframe ---
clusters['size'] = clusters.groupby('clusterId')['clonotypeKey']\
    .transform('size')

# Merge clusters with cloneTable to get clusterLabel
# Prepare the right-hand side of the merge
labelsTable = cloneTable[['clonotypeKey', 'clusterLabel']]
# Deduplicate based on 'clonotypeKey' to ensure each centroid key has only one label entry
labelsTable = labelsTable.drop_duplicates(subset=['clonotypeKey'])

clusters = pd.merge(clusters, labelsTable,
                    left_on='clusterId',
                    right_on='clonotypeKey',
                    how='left',
                    suffixes=('', '_y')
                    ).drop(columns=['clonotypeKey_y'])


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

required_cols_cts = ['clusterId', 'clusterLabel', 'sequence', 'size']
if 'sequence_second' in cloneTable.columns:
    required_cols_cts.append('sequence_second')

# Select necessary columns and ensure uniqueness by clusterId
cluster_to_seq = centroid_data[required_cols_cts].drop_duplicates(subset=[
                                                                  'clusterId'])

# Write cluster-to-seq.tsv
cluster_to_seq.to_csv(clusterToSeqTsv, sep="\t", index=False)


# --- Generate clone-to-cluster.tsv ---
clone_to_cluster = clusters[['clusterId',
                             'clonotypeKey', 'clusterLabel']].copy()
clone_to_cluster['link'] = 1
clone_to_cluster.to_csv(cloneToClusterTsv, sep="\t", index=False)


# --- Generate abundances.tsv ---
# Merge cloneTable and clusters (original, without size or just relevant columns) to link abundances to clusters
merged_abundances = pd.merge(cloneTable[['sampleId', 'clonotypeKey', 'abundance']], clusters[[
                             'clusterId', 'clonotypeKey']], on='clonotypeKey')

# Group by sample and cluster, summing abundances
cluster_abundances = merged_abundances.groupby(['sampleId', 'clusterId'])[
    'abundance'].sum().reset_index()

# Calculate normalized abundance within each sample
cluster_abundances['total_sample_abundance'] = cluster_abundances.groupby(
    'sampleId')['abundance'].transform('sum')
cluster_abundances['abundance_normalized'] = cluster_abundances['abundance'] / \
    cluster_abundances['total_sample_abundance']
cluster_abundances = cluster_abundances.drop(
    columns=['total_sample_abundance'])  # Remove the temporary column

# Write abundances.tsv
cluster_abundances.to_csv(abundancesTsv, sep="\t", index=False)

# --- Generate abundances-per-cluster.tsv ---
# Group by sample, summing abundances
abundances_per_cluster = cluster_abundances.groupby(
    'clusterId')['abundance'].sum().reset_index()

# Rename column header to avoid name conflicts
abundances_per_cluster.rename(
    columns={'abundance': 'abundance_per_cluster'}, inplace=True)

# Write abundances-per-cluster.tsv
abundances_per_cluster.to_csv(abundancesPerClusterTsv, sep="\t", index=False)
