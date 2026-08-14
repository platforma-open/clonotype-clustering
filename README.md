# Sequence Clustering

Group similar sequences — clonotypes or peptides — into clusters by sequence similarity. This Platforma block uses MMseqs2 to find related sequences that may share functional properties or antigen specificity, clustering them under a threshold you set on either exact identity or BLOSUM substitution scoring, then reports a consensus centroid, cluster statistics, and per-member distance for every cluster.

Open-source analysis block for Platforma, the biologics discovery platform by MiLaboratories. For the full no-code workflow, see [platforma.bio](https://platforma.bio/).

> **Naming:** this block appears as **Sequence Clustering** in the Platforma app. Older documentation and this repository name call it **Clonotype Clustering**. They are the same block.

## What it does

Treating every clonotype independently overstates how much distinct material a library contains — related variants of one binder get counted, ranked, and tested as if they were separate candidates. Clustering collapses that redundancy into families, so downstream analysis works at the level of distinct sequence groups.

Clustering runs on MMseqs2, using either Easy Cluster (more sensitive) or Easy Linclust (linear time, for very large inputs). Similarity can be scored two ways: **Exact Match**, requiring identical residues, or a **BLOSUM matrix** (40 through 90), which counts chemically conservative substitutions as similar — usually the better choice for antibody families, where a related binder rarely matches residue for residue. A minimum identity and a coverage threshold control how permissive the grouping is, and a high-precision mode is available for short sequences such as CDR3. Sequences can be trimmed at either end before clustering, to exclude primer or constant-region residues from the comparison.

Each cluster is then summarized. Members are aligned with Kalign and a **theoretical centroid** is derived by taking the winning residue in each alignment column; columns where nothing reaches the consensus threshold emit `X`. Because that consensus need not exist in the data, the closest real member is also reported as the **reference centroid**. Every member carries its distance to the centroid, and each cluster a radius, so you can tell a tight family from a loose one. The residue vote is either equal-weight, so the centroid describes the sequence set regardless of clonal expansion, or abundance-weighted, so expanded clones dominate.

Results are explored as a table, a bubble plot of the most abundant clusters, and a cluster size histogram. For peptide input, each cluster's consensus can be exported as a new dataset, collapsing the library to one representative sequence per family for downstream analysis.

## Inputs & outputs

* **Input:** amino acid or nucleotide sequences — clonotypes from bulk or single-cell V(D)J data, or peptides from [Peptide Profiling](https://github.com/platforma-open/peptide-extraction). One or more sequence columns can be clustered.
* **Output:** a cluster ID per sequence, cluster size, theoretical and reference centroid sequences, distance to centroid per member, and cluster radius — plus a bubble plot of the most abundant clusters and a cluster size histogram. Peptide input can additionally export consensus sequences as a new dataset.

## Specifications

| | |
|---|---|
| Block title in app | Sequence Clustering |
| Engine | [MMseqs2](https://github.com/soedinglab/MMseqs2) — Easy Cluster or Easy Linclust |
| Similarity scoring | Exact Match (sequence identity) or BLOSUM40 / 50 / 62 / 80 / 90 |
| Sequence types | Amino acid, nucleotide |
| Key parameters | Minimal identity, coverage threshold, high-precision mode for short sequences, trim from start/end |
| Centroid | Kalign MSA consensus (theoretical centroid) with configurable consensus threshold; closest real member reported as reference centroid; residue vote equal-weight or abundance-weighted |
| Per-cluster metrics | Cluster size, cluster radius, per-member distance to centroid |
| Views | Table, most abundant clusters bubble plot, cluster size histogram |
| Platforms | linux-x64, linux-aarch64, macOS x64, macOS arm64 |

## Use cases

* **Antibody discovery:** group related sequences that may share antigen specificity, and work at family level instead of per clonotype.
* **Redundancy collapse:** reduce a large repertoire or library to distinct families before ranking or ordering candidates.
* **Cluster-level enrichment:** feed clusters into [Enrichment Analysis](https://github.com/platforma-open/clonotype-enrichment) to see which families were selected across rounds, rather than which individual clones were.
* **Diversified lead selection:** supply cluster assignments to [Lead Selection](https://github.com/platforma-open/antibody-tcr-lead-selection), which uses them to spread the final panel across families.
* **Peptide motif discovery:** cluster peptide libraries to surface shared motifs, and export one consensus sequence per family.
* **Family tightness:** use cluster radius and distance-to-centroid to distinguish a converged family from a loosely related group.
* **Map overlay:** colour the [Sequence Space](https://github.com/platforma-open/clonotype-space) UMAP by cluster ID to see how clusters sit in the wider library.


## FAQ

### Should I use Exact Match or BLOSUM scoring?

BLOSUM scoring is usually the better choice for antibodies and TCRs: it credits chemically conservative substitutions, so functionally related variants group together even when residues differ. Use Exact Match when you specifically want identity-based grouping — deduplicating near-identical variants, for instance. Lower BLOSUM numbers are more permissive, higher numbers stricter.

### Easy Cluster or Easy Linclust?

Easy Cluster is more sensitive and is the right default. Easy Linclust scales linearly and is worth switching to when the input is large enough that Easy Cluster becomes slow.

### What is the difference between the theoretical and reference centroid?

The theoretical centroid is the consensus of the cluster's alignment — the winning residue at each column — so it summarizes the family but may not exist in your data. The reference centroid is the real member closest to that consensus. Distance-to-centroid and cluster radius are measured against the theoretical centroid, and both are always reported.

### What does the consensus threshold do?

It sets how much agreement a column needs before its residue is emitted into the theoretical centroid. Columns below the threshold emit `X`, marking positions where the family does not converge. The default is 0.6.

### Should the centroid be weighted by abundance?

Equal weight (the default) makes the centroid describe the cluster's sequence set regardless of which clones expanded. Abundance weighting lets expanded clones dominate the consensus, which is what you want when the question is about the dominant sequence rather than the family's shape.

### Can I cluster nucleotide sequences?

Yes. Sequence type is configurable; BLOSUM matrices apply to amino acid input.

### Does it work on short sequences like CDR3?

Yes — enable high-precision mode, which uses MMseqs2 settings suited to short sequences. Note that MMseqs2 needs at least 5 amino acids for k-mer matching, so peptides shorter than that may cluster incompletely or not at all; the block warns when it sees them.

### Why would I trim sequences before clustering?

To keep residues that are not biologically informative — primer remnants or constant-region flanks — from influencing similarity. Trimming applies before clustering, and the trimmed sequences are reported alongside the originals.

## Citation

If you use this block in your research, please cite MMseqs2, and Kalign if you use the centroid outputs:

> Steinegger, M., & Söding, J. (2017). MMseqs2 enables sensitive protein sequence searching for the analysis of massive data sets. *Nature Biotechnology* **35**(11), 1026–1028. [https://doi.org/10.1038/nbt.3988](https://doi.org/10.1038/nbt.3988)

## Documentation

Step-by-step guide: [Antibody Clustering](https://docs.platforma.bio/guides/antibody-discovery/antibody-clustering/)

## Part of the Platforma ecosystem

This block is part of [Platforma](https://platforma.bio/) by [MiLaboratories](https://github.com/milaboratory), built on [MMseqs2](https://github.com/soedinglab/MMseqs2) and [Kalign](https://github.com/TimoLassmann/kalign). Explore the other open-source blocks at [github.com/platforma-open](https://github.com/platforma-open) and the docs for antibody discovery at [docs.platforma.bio/biology-guides/antibody-discovery](https://docs.platforma.bio/biology-guides/antibody-discovery/).
