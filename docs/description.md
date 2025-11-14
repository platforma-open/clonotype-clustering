# Overview

Groups similar clonotypes into clusters based on their sequence similarity, enabling researchers to identify related clonotypes that may share functional properties or antigen specificities. The block utilizes MMseqs2's `easy-cluster` command for fast and sensitive sequence searching and clustering, grouping sequences that meet a specified identity threshold. The clustering is performed on amino acid or nucleotide sequences (configurable), and results include cluster assignments for each clonotype along with cluster-level statistics, visualized using bubble plots.

The clustered clonotype data can be used in downstream analysis blocks such as Clonotype Enrichment to analyze enrichment patterns at the cluster level across selection rounds, or Antibody/TCR Lead Selection to identify top candidates based on cluster-level scoring metrics.

MMseqs2 is developed by the Söding lab and Steinegger group. For more information, please see: [https://github.com/soedinglab/MMseqs2](https://github.com/soedinglab/MMseqs2) and cite the following publication if used in your research:

> Steinegger M and Soeding J. MMseqs2 enables sensitive protein sequence searching for the analysis of massive data sets. _Nature Biotechnology_, doi: 10.1038/nbt.3988 (2017). [https://doi.org/10.1038/nbt.3988](https://doi.org/10.1038/nbt.3988)
