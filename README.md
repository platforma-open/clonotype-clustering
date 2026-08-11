# Clonotype Clustering

Group similar sequences (clonotypes or peptides) into clusters based on sequence similarity. This Platforma block uses MMseqs2 to identify related sequences that may share functional properties or antigen specificities, grouping them by a configurable identity threshold and summarizing the results with cluster-level statistics and visualizations.

Open-source analysis block for **Platforma**, the biologics discovery platform by **MiLaboratories**. For the full no-code workflow, see [platforma.bio](https://platforma.bio).

## What it does

The Clonotype Clustering block groups similar sequences — clonotypes or peptides — into clusters based on sequence similarity. Related sequences are grouped together so researchers can identify families that may share functional properties or antigen specificities.

The block uses MMseqs2's clustering algorithms (**Easy Cluster** or **Easy Linclust**) for fast and sensitive sequence searching, grouping sequences that meet a specified identity threshold. Clustering runs on amino acid or nucleotide sequences (configurable), and results include cluster assignments for each sequence along with cluster-level statistics, visualized using bubble plots and histograms.

Clustering is useful when analysis calls for grouping related sequences into families, rather than treating each clonotype independently or selecting candidates based only on abundance or frequency.

## Inputs & outputs

- **Input:** amino acid or nucleotide sequences (clonotypes or peptides) from a Platforma clonotyping block
- **Output:** per-sequence cluster assignments and cluster-level statistics, visualized with bubble plots and histograms

## Use cases

- **Antibody discovery:** group related sequences that may share antigen specificity into clusters for family-level analysis.
- **Cluster-level enrichment:** feed clustered data into **Sequence Enrichment** to analyze enrichment patterns at the cluster level across selection rounds.
- **Lead selection:** feed clustered data into **Lead Selection** to identify top candidates based on cluster-level scoring metrics.
- **Peptide analysis:** cluster peptide sequences to reveal shared motifs and related families.
- **Repertoire analysis:** reduce large sequence sets to representative clusters for downstream interpretation.


## Part of the Platforma ecosystem

This block is part of [Platforma](https://platforma.bio) by [MiLaboratories](https://github.com/milaboratory), built on [MMseqs2](https://github.com/soedinglab/MMseqs2). Explore the other open-source blocks at [github.com/platforma-open](https://github.com/platforma-open) and the docs for antibody discovery at [https://docs.platforma.bio/biology-guides/antibody-discovery/](https://docs.platforma.bio/biology-guides/antibody-discovery/)
