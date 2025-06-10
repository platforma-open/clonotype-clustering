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

# Create a 'fullSequence' column by concatenating sequence_cols if they exist
if not sequence_cols:
    print("Warning: No sequence columns (e.g., 'sequence_0') found. Sequence-based distance calculation might fail or be incorrect.")
elif len(sequence_cols) == 1:
    cloneTable = cloneTable.with_columns(
        pl.col(sequence_cols[0]).alias('fullSequence')
    )
else:
    # Sort columns to ensure consistent concatenation order, e.g., sequence_0, sequence_1, ...
    sorted_sequence_cols = sorted(sequence_cols)
    cloneTable = cloneTable.with_columns(
        pl.concat_str(
            [pl.col(c) for c in sorted_sequence_cols],
            separator="===="  # Use "====" as separator
        ).alias('fullSequence')
    )

# Transform clonotypeKeyLabel from "C-XXXXXX" with "CL-XXXXXX"
cloneTable = cloneTable.with_columns(
    pl.col('clonotypeKeyLabel').str.replace('C-', 'CL-', n=1).alias('clusterLabel')
)

# clusterId, clonotypeKey
clusters = pl.read_csv(clustersTsv, separator="\t", has_header=False,
                       new_columns=["clusterId", "clonotypeKey"])

# Remove the "s-" prefix from clusterId and clonotypeKey. This prefix is added
# during FASTA preparation for mmseqs and needs to be removed to match keys
# in other tables like cloneTable.
clusters = clusters.with_columns(
    pl.col("clusterId").str.strip_prefix("s-"),
    pl.col("clonotypeKey").str.strip_prefix("s-")
)

# --- Calculate cluster sizes directly in the clusters dataframe ---
clusters = clusters.with_columns(
    pl.col('clonotypeKey').count().over('clusterId').alias('size')
)

# Merge clusters with cloneTable to get clusterLabel for the centroid
# This 'clusterLabel' is the transformed "CL-XXXX" label of the centroid.
labelsTable_for_join = cloneTable.select(
    pl.col('clonotypeKey').alias('clusterId'), # Alias to 'clusterId' to match the left table's key name
    'clusterLabel' # The "CL-XXXX" label associated with this key in cloneTable
).unique(subset=['clusterId'], keep='first') # Unique on the new 'clusterId' column

clusters = clusters.join(
    labelsTable_for_join,
    on='clusterId', # Join on 'clusterId', present in both DataFrames with the same meaning
    how='left'
)

# --- Generate cluster-to-seq.tsv ---
# Prepare the right DataFrame for the join, ensuring 'clusterId' and 'size' are treated as payload.
# The 'clusterLabel' here is the centroid's transformed label.
# We also need the centroid's sequence columns for this file.

# First, ensure 'clusters' has 'clusterLabel' (it should from the join above)
# Then, get sequence columns from the centroid.
# Centroid's key is 'clusterId' in the 'clusters' table.
# We need to join 'clusters' with 'cloneTable' (where 'clonotypeKey' is centroid's key)
# to fetch the sequence_cols for the centroid.

# Select sequence columns and 'clonotypeKey' from cloneTable for centroids
centroid_sequences_for_cts = cloneTable.select(
    [pl.col('clonotypeKey').alias("centroid_key_cts")] + sequence_cols
).unique("centroid_key_cts", keep="first")

# Join clusters with centroid_sequences_for_cts
# 'clusters' has: clusterId (centroid key), clonotypeKey (member key), size, clusterLabel (centroid's CL-label)
temp_cluster_to_seq_data = clusters.join(
    centroid_sequences_for_cts,
    left_on="clusterId",
    right_on="centroid_key_cts",
    how="left" # Keep all clusters
)

required_cols_cts = ['clusterId', 'clusterLabel', 'size'] + sequence_cols
# Select necessary columns. The sequence_cols will be from the centroid.
# We need to ensure we pick one row per clusterId.
# The join above might create multiple rows if a clusterId appeared multiple times in clusters
# (e.g. if clusters wasn't unique by clusterId before, though size calculation implies it's grouped by clusterId)
# However, the goal is one centroid sequence per cluster.
# The 'clusters' table after size calculation effectively lists members and their clusterId.
# For cluster-to-seq, we need one entry per clusterId, with its centroid's details.

# Let's use the 'clusterId' (centroid key) and its 'clusterLabel' and 'size' from the 'clusters' table,
# then join to get the centroid's sequences from 'cloneTable'.
# Create a base for cluster_to_seq from unique clusterIds and their already determined labels/sizes.
# Note: 'clusters' contains member clonotypeKeys. We need unique clusterIds.
unique_clusters_info = clusters.select(["clusterId", "clusterLabel", "size"]).unique(subset=["clusterId"], keep="first")

cluster_to_seq_df = unique_clusters_info.join(
    centroid_sequences_for_cts, # Contains centroid_key_cts and its sequence_cols
    left_on="clusterId",
    right_on="centroid_key_cts",
    how="left"
)

cluster_to_seq = cluster_to_seq_df.select(required_cols_cts)
cluster_to_seq.write_csv(clusterToSeqTsv, separator="\t")


# --- Generate clone-to-cluster.tsv ---
# 'clusters' should have: clusterId (centroid key), clonotypeKey (member key), clusterLabel (centroid's CL-label)
clone_to_cluster = clusters.select(['clusterId',
                                    'clonotypeKey',
                                    'clusterLabel']
                                   ).with_columns(pl.lit(1).alias('link'))
clone_to_cluster.write_csv(cloneToClusterTsv, separator="\t")


# --- Generate abundances.tsv ---
# Merge cloneTable and clusters to link abundances to clusters
# We need 'clusterId' from the 'clusters' table.
merged_abundances = cloneTable.select(['sampleId', 'clonotypeKey', 'abundance']).join(
    clusters.select(['clusterId', 'clonotypeKey']).unique(subset=["clonotypeKey"], keep="first"), # Ensure one cluster per clonotypeKey
    left_on='clonotypeKey', 
    right_on='clonotypeKey', 
    how='inner'
)

cluster_abundances = merged_abundances.group_by(['sampleId', 'clusterId']).agg(
    pl.sum('abundance').alias('abundance')
)

cluster_abundances = cluster_abundances.with_columns(
    pl.sum('abundance').over('sampleId').alias('total_sample_abundance')
)
cluster_abundances = cluster_abundances.with_columns(
    (pl.col('abundance') / pl.col('total_sample_abundance')).alias('abundance_normalized')
)
cluster_abundances = cluster_abundances.drop('total_sample_abundance')

cluster_abundances.write_csv(abundancesTsv, separator="\t")

# --- Generate abundances-per-cluster.tsv ---
abundances_per_cluster = cluster_abundances.group_by(
    'clusterId').agg(pl.sum('abundance').alias('abundance_per_cluster'))

abundances_per_cluster.write_csv(abundancesPerClusterTsv, separator="\t")

# --- Generate distance_to_centroid.tsv (New Segmented Approach) ---

# Base DataFrame: member's key and original label
# 'clonotypeKey' is the member's key.
# 'clonotypeKeyLabel' is the member's original label (e.g., "C-YYYY").
# 'clusterId' is the centroid's key.
# 'clusterLabel' is the centroid's transformed label (e.g., "CL-XXXX"), already in 'clusters' table.

# Start with the member-to-centroid assignments from the 'clusters' table.
# 'clusters' has: clonotypeKey (member), clusterId (centroid), size, clusterLabel (centroid's CL-label).
distance_df_base = clusters.select([
    pl.col("clonotypeKey"),             # Member's key
    pl.col("clusterId"),               # Centroid's key
    pl.col("clusterLabel")             # Centroid's transformed "CL-" label
])

# Add member's original 'clonotypeKeyLabel'
member_original_labels = cloneTable.select([
    pl.col("clonotypeKey").alias("member_key_for_label_join"),
    pl.col("clonotypeKeyLabel")        # Member's original "C-" label
]).unique("member_key_for_label_join", keep="first")

distance_df = distance_df_base.join(
    member_original_labels,
    left_on="clonotypeKey",
    right_on="member_key_for_label_join",
    how="left" # Should always find a match if clonotypeKey comes from cloneTable initially
)


if not sequence_cols:
    print("No sequence columns found. Setting distanceToCentroid to 0.0 for all entries.")
    distance_df = distance_df.with_columns(pl.lit(0.0, dtype=pl.Float64).alias("distanceToCentroid"))
else:
    # Prepare member's sequence data for join
    member_seq_select_expr = [pl.col("clonotypeKey").alias("member_join_key_seq")] + \
                             [pl.col(sc).alias(f"member_{sc}") for sc in sequence_cols]
    member_sequences_to_join = cloneTable.select(member_seq_select_expr).unique("member_join_key_seq", keep="first")

    # Prepare centroid's sequence data for join
    centroid_seq_select_expr = [pl.col("clonotypeKey").alias("centroid_join_key_seq")] + \
                               [pl.col(sc).alias(f"centroid_{sc}") for sc in sequence_cols]
    centroid_sequences_to_join = cloneTable.select(centroid_seq_select_expr).unique("centroid_join_key_seq", keep="first")
    
    # Add member sequences to distance_df
    distance_df = distance_df.join(
        member_sequences_to_join,
        left_on="clonotypeKey", # Member's key from distance_df
        right_on="member_join_key_seq",
        how="left" 
    )
    
    # Add centroid sequences to distance_df
    distance_df = distance_df.join(
        centroid_sequences_to_join,
        left_on="clusterId", # Centroid's key from distance_df
        right_on="centroid_join_key_seq",
        how="left" 
    )

    temp_raw_dist_cols = []
    temp_len_centroid_cols = []

    for sc_base_name in sequence_cols: # e.g., "sequence_0", "sequence_1"
        member_sc_col = f"member_{sc_base_name}"
        centroid_sc_col = f"centroid_{sc_base_name}"
        
        raw_dist_segment_col = f"__raw_dist_{sc_base_name}"
        len_centroid_segment_col = f"__len_centroid_{sc_base_name}"
        
        temp_raw_dist_cols.append(raw_dist_segment_col)
        temp_len_centroid_cols.append(len_centroid_segment_col)

        distance_df = distance_df.with_columns(
            pl.when(pl.col(member_sc_col).is_not_null() & pl.col(centroid_sc_col).is_not_null())
              .then(pds.str_leven(pl.col(member_sc_col), pl.col(centroid_sc_col), return_sim=False))
              .when(pl.col(member_sc_col).is_not_null() & pl.col(centroid_sc_col).is_null())
              .then(pl.col(member_sc_col).str.len_chars())
              .when(pl.col(member_sc_col).is_null() & pl.col(centroid_sc_col).is_not_null())
              .then(pl.col(centroid_sc_col).str.len_chars())
              .otherwise(0) # Both null
              .alias(raw_dist_segment_col),
            
            pl.col(centroid_sc_col).str.len_chars().fill_null(0).alias(len_centroid_segment_col)
        )
    
    distance_df = distance_df.with_columns(
        pl.sum_horizontal([pl.col(name) for name in temp_raw_dist_cols]).alias("total_raw_distance"),
        pl.sum_horizontal([pl.col(name) for name in temp_len_centroid_cols]).alias("total_centroid_length_for_norm")
    )
    
    distance_df = distance_df.with_columns(
        pl.when(pl.col("total_centroid_length_for_norm") > 0)
          .then(
              pl.min_horizontal( 
                  pl.lit(1.0, dtype=pl.Float64),
                  pl.col("total_raw_distance").cast(pl.Float64) / pl.col("total_centroid_length_for_norm").cast(pl.Float64)
              )
          )
          .when(pl.col("total_raw_distance") == 0) 
          .then(pl.lit(0.0, dtype=pl.Float64))
          .otherwise(pl.lit(1.0, dtype=pl.Float64)) 
          .alias("distanceToCentroid")
    )
    
    cols_to_drop_after_calc = temp_raw_dist_cols + temp_len_centroid_cols + \
                              [f"member_{sc}" for sc in sequence_cols] + \
                              [f"centroid_{sc}" for sc in sequence_cols] + \
                              ["member_join_key_seq", "centroid_join_key_seq"]

    existing_cols_to_drop = [col for col in cols_to_drop_after_calc if col in distance_df.columns]
    if existing_cols_to_drop:
        distance_df = distance_df.drop(existing_cols_to_drop)


# Select final columns for the output TSV
# Ensure all these columns exist in distance_df at this point
# clonotypeKey, clusterId, clusterLabel, clonotypeKeyLabel, distanceToCentroid
output_columns = [
    "clonotypeKey",        # Member's key
    "clusterId",           # Centroid's key
    "clonotypeKeyLabel",   # Member's original "C-" label
    "clusterLabel",        # Centroid's transformed "CL-" label
    "distanceToCentroid"
]
# Reorder/select columns if necessary, ensuring they exist
# If any are missing (e.g. if clonotypeKeyLabel was not joined correctly), this would error.
# The construction of distance_df above should ensure these are present.
distance_df_to_write = distance_df.select(output_columns)


# Drop duplicate rows based on clonotypeKey (member's key), keeping the first occurrence.
# This ensures one distance entry per member clonotype.
distance_df_to_write = distance_df_to_write.unique(subset=["clonotypeKey"], keep="first")

# Output to TSV
output_distance_tsv = "distance_to_centroid.tsv"
distance_df_to_write.write_csv(output_distance_tsv, separator="\t")

print(f"Generated {output_distance_tsv}")

if distance_df_to_write.height == distance_df_to_write.select(pl.col("clonotypeKey").n_unique()).item():
    print(f"Verified: All clonotypeKey values in the written {output_distance_tsv} are unique.")
else:
    print(f"WARNING: clonotypeKey values in the written {output_distance_tsv} are still not unique. This is unexpected after dropping duplicates.")