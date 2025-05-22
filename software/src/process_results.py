import polars as pl
import polars_ds as pds

clustersTsv = "clusters.tsv"
cloneTableTsv = "cloneTable.tsv"
clusterToSeqTsv = "cluster-to-seq.tsv"
cloneToClusterTsv = "clone-to-cluster.tsv"
abundancesTsv = "abundances.tsv"
abundancesPerClusterTsv = "abundances-per-cluster.tsv"

# sampleId, clonotypeKey, clonotypeKeyLabel,sequence_..., 
# ...VGene, JGene
cloneTable = pl.read_csv(cloneTableTsv, separator="\t")

# Get all sequence columns if we have them
sequence_cols = [col for col in cloneTable.columns 
                 if col.startswith('sequence_')]

# Transform clonotypeKeyLabel from "C-XXXXXX" with "CL-XXXXXX"
cloneTable = cloneTable.with_columns(
    pl.col('clonotypeKeyLabel').str.replace('C-', 'CL-', n=1).alias('clusterLabel')
)

# clusterId, clonotypeKey
clusters = pl.read_csv(clustersTsv, separator="\t", has_header=False,
                       new_columns=["clusterId", "clonotypeKey"])

# --- Calculate cluster sizes directly in the clusters dataframe ---
clusters = clusters.with_columns(
    pl.col('clonotypeKey').count().over('clusterId').alias('size')
)

# Merge clusters with cloneTable to get clusterLabel
# Prepare the right-hand side of the merge
labelsTable_for_join = cloneTable.select(
    pl.col('clonotypeKey').alias('centroidKey'), # Rename to avoid clash
    'clusterLabel'
).unique(subset=['centroidKey'], keep='first')

clusters = clusters.join(labelsTable_for_join,
                         left_on='clusterId',
                         right_on='centroidKey',
                         how='left'
                         )


# --- Generate cluster-to-seq.tsv ---
# Prepare the right DataFrame for the join, ensuring 'clusterId' and 'size' are treated as payload.
right_df_for_join = clusters.select(
    pl.col("clusterId").alias("cluster_id_key"), # Alias for explicit use as right_on key
    pl.col("clusterId"),                         # Explicitly select 'clusterId' as a data column
    pl.col("size")                               # Explicitly select 'size' as a data column
).unique(subset=["cluster_id_key"], keep="first") # Deduplicate based on the key an alias for clusterId

# Merge cloneTable with the prepared right_df_for_join
centroid_data = cloneTable.join(
    right_df_for_join,
    left_on='clonotypeKey',      # Key from cloneTable
    right_on='cluster_id_key', # Key from right_df_for_join
    how='inner'
)

# Drop the aliased join key
if 'cluster_id_key' in centroid_data.columns and 'clusterId' in centroid_data.columns:
    centroid_data = centroid_data.drop('cluster_id_key')


required_cols_cts = ['clusterId',
                     'clusterLabel',
                     'size'] + sequence_cols

# Select necessary columns and ensure uniqueness by clusterId
cluster_to_seq = centroid_data.select(required_cols_cts).unique(subset=[
                                                                  'clusterId'], keep='first')

# Write cluster-to-seq.tsv
cluster_to_seq.write_csv(clusterToSeqTsv, separator="\t")


# --- Generate clone-to-cluster.tsv ---
# Ensure 'clusters' DataFrame has 'clusterLabel'
if 'clusterLabel' not in clusters.columns and 'centroidKey' in clusters.columns:
        pass


clone_to_cluster = clusters.select(['clusterId',
                                    'clonotypeKey',
                                    'clusterLabel']
                                   ).with_columns(pl.lit(1).alias('link'))
clone_to_cluster.write_csv(cloneToClusterTsv, separator="\t")


# --- Generate abundances.tsv ---
# Merge cloneTable and clusters to link abundances to clusters
merged_abundances = cloneTable.select(['sampleId', 'clonotypeKey', 'abundance']).join(
    clusters.select(['clusterId', 'clonotypeKey']), # Select only necessary keys from clusters
    left_on='clonotypeKey', # Member key from cloneTable
    right_on='clonotypeKey', # Member key from clusters to link to its clusterId
    how='inner'
)

# Group by sample and cluster, summing abundances
cluster_abundances = merged_abundances.group_by(['sampleId', 'clusterId']).agg(
    pl.sum('abundance').alias('abundance')
)

# Calculate normalized abundance within each sample
cluster_abundances = cluster_abundances.with_columns(
    pl.sum('abundance').over('sampleId').alias('total_sample_abundance')
)
cluster_abundances = cluster_abundances.with_columns(
    (pl.col('abundance') / pl.col('total_sample_abundance')).alias('abundance_normalized')
)
cluster_abundances = cluster_abundances.drop('total_sample_abundance')

# Write abundances.tsv
cluster_abundances.write_csv(abundancesTsv, separator="\t")

# --- Generate abundances-per-cluster.tsv ---
# Group by clusterId, summing abundances
abundances_per_cluster = cluster_abundances.group_by(
    'clusterId').agg(pl.sum('abundance').alias('abundance_per_cluster'))


# Write abundances-per-cluster.tsv
abundances_per_cluster.write_csv(abundancesPerClusterTsv, separator="\t")

# --- Generate distance_to_centroid.tsv ---

# 1. Get clonotype's own details (clonotypeKey and its original label)
clonotype_details = cloneTable.select(["clonotypeKey", "clonotypeKeyLabel"])

# 2. Get cluster assignment details for each member clonotypeKey
cluster_assignment_details = clusters.select(["clonotypeKey", "clusterId", "clusterLabel"])

# 3. Join to bring clonotype's label and its cluster's label together
distance_df = clonotype_details.join(
    cluster_assignment_details,
    on="clonotypeKey",  # Join on the member clonotypeKey
    how="inner"         # Only include clonotypes that are assigned to a cluster
)

# Re-select to ensure correct order and only necessary columns before adding distance
distance_df = distance_df.select([
    "clonotypeKey",
    "clusterId",
    "clonotypeKeyLabel",
    "clusterLabel"
])

# 4. Calculate Levenshtein similarity and then normalized distance
try:
    # Calculate similarity first
    similarity_expr = pds.str_leven(
        "clonotypeKeyLabel",
        pl.col("clusterLabel"),
        return_sim=True # Get similarity instead of distance
    )
    
    # Calculate normalized distance as 1 - similarity
    distance_df = distance_df.with_columns(
        (1 - similarity_expr).alias("distanceToCentroid")
    )
except Exception as e:
    print(f"\nERROR during Levenshtein similarity/distance calculation with `pds.str_leven`: {e}")
    print("A placeholder 'distanceToCentroid' column with null values will be added.")
    print("Please ensure `polars_ds` is installed and the columns have compatible types (string).\n")
    distance_df = distance_df.with_columns(
        pl.lit(None, dtype=pl.Float64).alias("distanceToCentroid") 
    )
    
# 5. Drop duplicate rows based on clonotypeKey, keeping the first occurrence
distance_df = distance_df.unique(subset=["clonotypeKey"], keep="first")

# 6. Output to TSV
output_distance_tsv = "distance_to_centroid.tsv"
distance_df.write_csv(output_distance_tsv, separator="\t")

print(f"Generated {output_distance_tsv}")
# Check for uniqueness after dropping duplicates
if distance_df.height == distance_df.select(pl.col("clonotypeKey").n_unique()).item():
    print(f"Verified: All clonotypeKey values in the written {output_distance_tsv} are unique.")
else:
    print(f"WARNING: clonotypeKey values in the written {output_distance_tsv} are still not unique. This is unexpected after dropping duplicates.")

