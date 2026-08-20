import type { PlRef, SUniversalPColumnId } from "@platforma-sdk/model";

/** Alphabet the picked sequence columns are read in. */
export type SequenceType = "aminoacid" | "nucleotide";

/** Substitution matrix MMseqs2 scores a pair of sequences with. */
export type SimilarityType =
  | "sequence-identity"
  | "blosum40"
  | "blosum50"
  | "blosum62"
  | "blosum80"
  | "blosum90";

/** MMseqs2 `--cov-mode`: which of query and target the coverage fraction is measured over. */
export type CoverageMode = 0 | 1 | 2 | 3 | 4 | 5;

export type ClusteringTool = "easy-cluster" | "easy-linclust";

/** How a cluster's members are laid out in columns before the consensus vote. */
export type CentroidAlignment = "auto" | "gapped" | "ungapped";

/**
 * This block's init-params contract — the shape a block of this kind receives
 * at creation, and exactly what a project template serializes for it.
 *
 * Every field is optional. A block with no dataset picked and no sequence
 * columns selected is an ordinary state the UI reaches, so export has to be able
 * to write it and apply has to be able to take it back; a contract that demanded
 * `datasetRef` would make export and apply stop being inverses. Whether a
 * configuration is runnable is settled by the model's `args` lambda, not here.
 *
 * View state — the table's grid state, the two graph states, the alignment
 * widget's model — is deliberately absent: it is what the user is looking at,
 * not the recipe a template exists to reproduce.
 */
export type BlockParams = {
  // Input wiring — the upstream dataset, and the sequence columns picked within
  // it. Both are what a template engine fills from an earlier entry's output.
  datasetRef?: PlRef;
  sequencesRef?: SUniversalPColumnId[];
  sequenceType?: SequenceType;

  // Clustering configuration — the recipe a template exists to reproduce.
  identity?: number;
  similarityType?: SimilarityType;
  coverageThreshold?: number;
  coverageMode?: CoverageMode;
  highPrecision?: boolean;
  trimStart?: number;
  trimEnd?: number;
  clusteringTool?: ClusteringTool;

  // Centroid configuration.
  consensusThreshold?: number;
  gapThreshold?: number;
  centroidAlignment?: CentroidAlignment;
  weightByAbundance?: boolean;
  generateDataset?: boolean;

  // Per-process resource limits.
  mem?: number;
  cpu?: number;

  // Display naming.
  defaultBlockLabel?: string;
  customBlockLabel?: string;
};
