import type { GraphMakerState } from "@milaboratories/graph-maker";
import strings from "@milaboratories/strings";
import type {
  PColumnIdAndSpec,
  PColumnSpec,
  PFrameHandle,
  PlDataTableStateV2,
  PlMultiSequenceAlignmentModel,
  PlRef,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import {
  BlockModelV3,
  DataModelBuilder,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV2,
} from "@platforma-sdk/model";
import { kind } from "@platforma-open/milaboratories.clonotype-clustering.kind";
export type * from "@milaboratories/helpers";

/** Map user-facing similarity type to mmseqs2 similarity type */
export const similarityTypeOptions = [
  { label: "Exact Match", value: "sequence-identity" },
  { label: "BLOSUM40", value: "blosum40" },
  { label: "BLOSUM50", value: "blosum50" },
  { label: "BLOSUM62", value: "blosum62" },
  { label: "BLOSUM80", value: "blosum80" },
  { label: "BLOSUM90", value: "blosum90" },
] as const;

export const centroidAlignmentOptions = [
  { label: "Automatic", value: "auto" },
  { label: "Gapped (MSA)", value: "gapped" },
  { label: "Ungapped (fixed length)", value: "ungapped" },
] as const;

export const clusteringToolOptions = [
  { label: "Easy Cluster", value: "easy-cluster" },
  { label: "Easy Linclust", value: "easy-linclust" },
] as const;

type OldArgs = {
  defaultBlockLabel: string;
  customBlockLabel: string;
  datasetRef?: PlRef;
  sequencesRef: SUniversalPColumnId[];
  // Added sequenceType here for future use in algorithm selection in workflow
  sequenceType: "aminoacid" | "nucleotide";
  identity: number;
  similarityType:
    | "sequence-identity"
    | "blosum40"
    | "blosum50"
    | "blosum62"
    | "blosum80"
    | "blosum90";
  coverageThreshold: number; // fraction of aligned residues required
  coverageMode: 0 | 1 | 2 | 3 | 4 | 5; // Complex option. Not available to user
  highPrecision: boolean; // use high-precision mmseqs2 settings (suitable for short sequences like CDR3)
  trimStart?: number; // number of amino acids to remove from the beginning
  trimEnd?: number; // number of amino acids to remove from the end
  clusteringTool: "easy-cluster" | "easy-linclust";
  mem?: number;
  cpu?: number;
};

type OldUiState = {
  tableState: PlDataTableStateV2;
  graphStateBubble: GraphMakerState;
  alignmentModel: PlMultiSequenceAlignmentModel;
  graphStateHistogram: GraphMakerState;
};

export type BlockData = {
  defaultBlockLabel: string;
  customBlockLabel: string;
  datasetRef?: PlRef;
  sequencesRef: SUniversalPColumnId[];
  sequenceType: "aminoacid" | "nucleotide";
  identity: number;
  similarityType:
    | "sequence-identity"
    | "blosum40"
    | "blosum50"
    | "blosum62"
    | "blosum80"
    | "blosum90";
  coverageThreshold: number; // fraction of aligned residues required
  coverageMode: 0 | 1 | 2 | 3 | 4 | 5; // Complex option. Not available to user
  highPrecision: boolean; // use high-precision mmseqs2 settings (suitable for short sequences like CDR3)
  trimStart?: number; // number of amino acids to remove from the beginning
  trimEnd?: number; // number of amino acids to remove from the end
  clusteringTool: "easy-cluster" | "easy-linclust";
  // Consensus threshold for the theoretical (consensus) centroid: minimum
  // abundance-weighted fraction a residue must reach in an MSA column to be emitted,
  // otherwise "X". Range 0-1, default 0.6.
  consensusThreshold: number;
  // Fraction of an MSA column's abundance weight that gaps must EXCEED for the position
  // to count as absent from the cluster; such a column yields "-" instead of a residue.
  // Mirrors HMMER hmmbuild --symfrac stated in gap terms (gapThreshold = 1 - symfrac),
  // same 0.5 default. At 1.0 every column holding a residue is kept; at 0.0 any column
  // containing a gap is absent. The comparison is strict so both endpoints stay usable.
  // Separate from consensusThreshold, which decides WHICH residue a present position has.
  gapThreshold: number;
  // How a cluster's members are laid out in columns before the vote. "gapped" runs a
  // kalign MSA, which may insert internal gaps and widen the layout past the input
  // length. "ungapped" forbids internal gaps and allows only terminal offsets — the
  // model FaSTPACE uses for peptides and MEME for motifs. On a fixed-length library
  // every offset is 0, so the centroid keeps the input length exactly and is the optimal
  // median string under Hamming distance. "auto" (the default) leaves the pick to the
  // workflow, which chooses ungapped only for a peptide library whose sequence lengths sit
  // at one value — a fact about the library, which only the data can answer, so the
  // resolved value is not known here.
  centroidAlignment: "auto" | "gapped" | "ungapped";
  // Whether the centroid (and the profile distance / reference centroid measured
  // against it) is weighted by clonotype abundance. When false every clonotype
  // counts equally and column ties break deterministically (alphabetically), so the
  // centroid reflects the cluster's sequence set rather than which clones expanded.
  // Default false (equal weight).
  weightByAbundance: boolean;
  // Additionally expose a dataset of per-cluster plurality-consensus centroid sequences
  // (weighted per-column argmax, no threshold, no 'X' — the theoretical centroid at
  // threshold 0). Peptide inputs only. Default false.
  generateDataset: boolean;
  mem?: number;
  cpu?: number;
  tableState: PlDataTableStateV2;
  graphStateBubble: GraphMakerState;
  alignmentModel: PlMultiSequenceAlignmentModel;
  graphStateHistogram: GraphMakerState;
};

export function getDefaultBlockLabel(data: {
  sequenceLabels: string[];
  similarityType: BlockData["similarityType"];
  identity: number;
  coverageThreshold: number;
  trimStart: number;
  trimEnd: number;
  // Included so two blocks placed side by side to compare centroid settings do not end up
  // with identical auto-labels. Only the non-default values are appended, keeping the label
  // short for the common case.
  centroidAlignment?: BlockData["centroidAlignment"];
}) {
  const parts: string[] = [];
  parts.push(data.sequenceLabels.join(" - "));
  parts.push(
    similarityTypeOptions.find((o) => o.value === data.similarityType)?.label ?? "BLOSUM62",
  );
  parts.push(`ident:${data.identity}`);
  parts.push(`cov:${data.coverageThreshold}`);
  if (data.trimStart > 0) {
    parts.push(`trimStart: ${data.trimStart}`);
  }
  if (data.trimEnd > 0) {
    parts.push(`trimEnd: ${data.trimEnd}`);
  }
  if (data.centroidAlignment !== undefined && data.centroidAlignment !== "auto") {
    parts.push(data.centroidAlignment);
  }
  return parts.filter(Boolean).join(", ");
}

const defaultSimilarityType = similarityTypeOptions[3];

const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .upgradeLegacy<OldArgs, OldUiState>(({ args, uiState }) => ({
    ...args,
    similarityType:
      (args.similarityType as string) === "alignment-score" ? "blosum62" : args.similarityType,
    consensusThreshold: 0.6,
    gapThreshold: 0.5,
    // Not "auto": a project made before this setting existed ran the gapped layout, and
    // reopening it should not silently switch the model underneath its results.
    centroidAlignment: "gapped",
    weightByAbundance: false,
    generateDataset: false,
    tableState: uiState.tableState,
    graphStateBubble: uiState.graphStateBubble,
    alignmentModel: uiState.alignmentModel,
    graphStateHistogram: uiState.graphStateHistogram,
  }))
  // `params` is absent when a block is created by hand rather than from a
  // template, so every field the contract carries keeps its own default.
  .init(({ params }) => ({
    ...params,
    defaultBlockLabel:
      params?.defaultBlockLabel ??
      getDefaultBlockLabel({
        sequenceLabels: [],
        similarityType: defaultSimilarityType.value,
        identity: 0.8,
        coverageThreshold: 0.8,
        trimStart: 0,
        trimEnd: 0,
        centroidAlignment: "auto",
      }),
    customBlockLabel: params?.customBlockLabel ?? "",
    sequencesRef: params?.sequencesRef ?? [],
    sequenceType: params?.sequenceType ?? "aminoacid",
    identity: params?.identity ?? 0.8,
    similarityType: params?.similarityType ?? defaultSimilarityType.value,
    coverageThreshold: params?.coverageThreshold ?? 0.8, // default value matching MMseqs2 default
    coverageMode: params?.coverageMode ?? 0, // default to coverage of query and target
    highPrecision: params?.highPrecision ?? false, // default to off, can be enabled manually in advanced settings
    trimStart: params?.trimStart ?? 0, // default to no trimming from start
    trimEnd: params?.trimEnd ?? 0, // default to no trimming from end
    clusteringTool: params?.clusteringTool ?? "easy-cluster",
    consensusThreshold: params?.consensusThreshold ?? 0.6, // default majority threshold for the theoretical centroid
    gapThreshold: params?.gapThreshold ?? 0.5, // HMMER --symfrac 0.5 default, stated in gap terms
    // Resolved in the workflow: ungapped for a peptide library of one length, else gapped
    centroidAlignment: params?.centroidAlignment ?? "auto",
    weightByAbundance: params?.weightByAbundance ?? false, // default to equal-weight centroid (abundance ignored)
    generateDataset: params?.generateDataset ?? false, // off by default; peptide inputs only
    tableState: createPlDataTableStateV2(),
    graphStateBubble: {
      title: "Most abundant clusters",
      template: "bubble",
      currentTab: null,
      layersSettings: {
        bubble: {
          normalizationDirection: null,
        },
      },
    },
    alignmentModel: {},
    graphStateHistogram: {
      title: strings.titles.histogram,
      template: "bins",
      currentTab: null,
      layersSettings: {
        bins: { fillColor: "#99e099" },
      },
      axesSettings: {
        axisY: {
          axisLabelsAngle: 90,
          scale: "log",
        },
        other: { binsCount: 30 },
      },
    },
  }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  // Inverse of `init` — the same fields, projected back out for template export.
  // The table's grid state, the two graph states and the alignment model are
  // view state and never cross the boundary. The block holds no file handles, so
  // nothing here is bound to the machine it was exported from.
  .templateParams((data) => ({
    datasetRef: data.datasetRef,
    sequencesRef: data.sequencesRef,
    sequenceType: data.sequenceType,

    identity: data.identity,
    similarityType: data.similarityType,
    coverageThreshold: data.coverageThreshold,
    coverageMode: data.coverageMode,
    highPrecision: data.highPrecision,
    trimStart: data.trimStart,
    trimEnd: data.trimEnd,
    clusteringTool: data.clusteringTool,

    consensusThreshold: data.consensusThreshold,
    gapThreshold: data.gapThreshold,
    centroidAlignment: data.centroidAlignment,
    weightByAbundance: data.weightByAbundance,
    generateDataset: data.generateDataset,

    mem: data.mem,
    cpu: data.cpu,

    defaultBlockLabel: data.defaultBlockLabel,
    customBlockLabel: data.customBlockLabel,
  }))

  .args((data) => {
    if (!data.datasetRef) throw new Error("Dataset is required");
    if (!data.sequencesRef.length) throw new Error("Sequences are required");
    return {
      defaultBlockLabel: data.defaultBlockLabel,
      customBlockLabel: data.customBlockLabel,
      datasetRef: data.datasetRef,
      sequencesRef: data.sequencesRef,
      sequenceType: data.sequenceType,
      identity: data.identity,
      similarityType: data.similarityType,
      coverageThreshold: data.coverageThreshold,
      coverageMode: data.coverageMode,
      highPrecision: data.highPrecision,
      trimStart: data.trimStart,
      trimEnd: data.trimEnd,
      clusteringTool: data.clusteringTool,
      consensusThreshold: data.consensusThreshold,
      gapThreshold: data.gapThreshold,
      centroidAlignment: data.centroidAlignment,
      weightByAbundance: data.weightByAbundance,
      generateDataset: data.generateDataset,
      mem: data.mem,
      cpu: data.cpu,
    };
  })

  .output("datasetOptions", (ctx) => {
    const options = ctx.resultPool.getOptions(
      [
        {
          axes: [{ name: "pl7.app/sampleId" }, { name: "pl7.app/vdj/clonotypeKey" }],
          annotations: { "pl7.app/isAnchor": "true" },
        },
        {
          axes: [{ name: "pl7.app/sampleId" }, { name: "pl7.app/vdj/scClonotypeKey" }],
          annotations: { "pl7.app/isAnchor": "true" },
        },
        {
          axes: [{ name: "pl7.app/sampleId" }, { name: "pl7.app/variantKey" }],
          annotations: { "pl7.app/isAnchor": "true" },
        },
      ],
      {
        // suppress native label of the column (e.g. "Number of Reads") to show only the dataset label
        label: { includeNativeLabel: false },
      },
    );

    // Exclude this block's OWN exported centroid dataset from the input picker
    return options.filter((opt) => {
      const keyAxis = ctx.resultPool.getPColumnSpecByRef(opt.ref)?.axesSpec[1];
      return keyAxis?.domain?.["pl7.app/clustering/algorithm"] === undefined;
    });
  })

  .output("sequenceOptions", (ctx) => {
    const ref = ctx.data.datasetRef;
    if (ref === undefined) return undefined;

    const keyAxis = ctx.resultPool.getPColumnSpecByRef(ref)?.axesSpec[1];
    const axis1Name = keyAxis?.name;
    const keyAxisDomain = keyAxis?.domain ?? {};

    // Both peptide-extraction and synthetic-repertoire-profiler key sequences on
    // the pl7.app/variantKey axis; the axis domain distinguishes the two modalities:
    //   peptide-extraction           -> pl7.app/peptide/extractionRunId    (feature "peptide")
    //   synthetic-repertoire-profiler -> pl7.app/repertoire/extractionRunId (feature "amplicon-sequence")
    const isPeptide =
      axis1Name === "pl7.app/variantKey" &&
      keyAxisDomain["pl7.app/peptide/extractionRunId"] !== undefined;
    const isAmplicon =
      axis1Name === "pl7.app/variantKey" &&
      keyAxisDomain["pl7.app/repertoire/extractionRunId"] !== undefined;
    // Paired chains live in the scClonotypeChain column domain. Imported paired sets have them
    // on pl7.app/variantKey, so ask for such a column rather than trusting the axis name.
    const perChainColumns = ctx.resultPool.getAnchoredPColumns({ main: ref }, [
      { name: "pl7.app/vdj/sequence", domain: { "pl7.app/vdj/scClonotypeChain/index": "primary" } },
    ]);
    const isSingleCell =
      axis1Name === "pl7.app/vdj/scClonotypeKey" || (perChainColumns?.length ?? 0) > 0;

    const sequenceMatchers = [];

    if (isPeptide) {
      sequenceMatchers.push({
        axes: [{ anchor: "main", idx: 1 }],
        name: "pl7.app/sequence",
        domain: {
          "pl7.app/feature": "peptide",
          "pl7.app/alphabet": ctx.data.sequenceType,
        },
      });
    } else if (isAmplicon) {
      // Feature-agnostic discovery (mirrors the VDJ branch below): match every
      // pl7.app/sequence on the variant axis regardless of pl7.app/feature, so the
      // whole-variant sequence (feature "amplicon-sequence") and each region
      // subsequence (feature = region name) all surface as options. Each column
      // carries a distinct feature in its derived id, so the workflow's
      // addSingle(ref) resolves the picked sequence uniquely.
      sequenceMatchers.push({
        axes: [{ anchor: "main", idx: 1 }],
        name: "pl7.app/sequence",
        domain: {
          "pl7.app/alphabet": ctx.data.sequenceType,
        },
      });
    } else {
      // const allowedFeatures = ['CDR1', 'CDR2', 'CDR3', 'FR1', 'FR2',
      //   'FR3', 'FR4', 'FR4InFrame', 'VDJRegion', 'VDJRegionInFrame'];
      // for (const feature of allowedFeatures) {
      if (isSingleCell) {
        sequenceMatchers.push({
          axes: [{ anchor: "main", idx: 1 }],
          name: "pl7.app/vdj/sequence",
          domain: {
            // 'pl7.app/vdj/feature': feature,
            "pl7.app/vdj/scClonotypeChain/index": "primary",
            "pl7.app/alphabet": ctx.data.sequenceType,
          },
        });
      } else {
        sequenceMatchers.push({
          axes: [{ anchor: "main", idx: 1 }],
          name: "pl7.app/vdj/sequence",
          domain: {
            // 'pl7.app/vdj/feature': feature,
            "pl7.app/alphabet": ctx.data.sequenceType,
          },
        });
      }

      // Check if any PColumns in the dataset have the name "pl7.app/vdj/scFv-sequence"
      const scfvColumns = ctx.resultPool.getAnchoredPColumns({ main: ref }, [
        {
          name: "pl7.app/vdj/scFv-sequence",
        },
      ]);
      if (scfvColumns && scfvColumns.length > 0) {
        sequenceMatchers.push({
          axes: [{ anchor: "main", idx: 1 }],
          name: "pl7.app/vdj/scFv-sequence",
          domain: {
            "pl7.app/alphabet": ctx.data.sequenceType,
          },
        });
      }
    }

    return ctx.resultPool.getCanonicalOptions({ main: ref }, sequenceMatchers, {
      ignoreMissingDomains: true,
      labelOps: {
        includeNativeLabel: true,
      },
    });
  })

  .output("isSingleCell", (ctx) => {
    if (ctx.data.datasetRef === undefined) return undefined;

    const spec = ctx.resultPool.getPColumnSpecByRef(ctx.data.datasetRef);
    if (spec === undefined) {
      return undefined;
    }

    // Same test as in sequenceOptions above.
    const perChainColumns = ctx.resultPool.getAnchoredPColumns({ main: ctx.data.datasetRef }, [
      { name: "pl7.app/vdj/sequence", domain: { "pl7.app/vdj/scClonotypeChain/index": "primary" } },
    ]);
    return (
      spec.axesSpec[1].name === "pl7.app/vdj/scClonotypeKey" || (perChainColumns?.length ?? 0) > 0
    );
  })

  .output(
    "modality",
    (ctx) => {
      const spec = ctx.data.datasetRef
        ? ctx.resultPool.getPColumnSpecByRef(ctx.data.datasetRef)
        : undefined;
      if (!spec) return undefined;
      for (const ax of spec.axesSpec) {
        if (ax.name === "pl7.app/variantKey") {
          // Three producers share this axis; the run-id in its domain is what separates them.
          // import-vdj-data's bare antibody sets stamp pl7.app/vdj/clonotypingRunId and are not
          // peptide — calling them peptide offers the consensus-export checkbox for a dataset
          // the workflow would then stamp peptide. peptide-extraction and
          // synthetic-repertoire-profiler both remain "peptide" here, as before.
          return (ax.domain ?? {})["pl7.app/vdj/clonotypingRunId"] !== undefined
            ? "antibody_tcr"
            : "peptide";
        }
        if (ax.name === "pl7.app/vdj/clonotypeKey" || ax.name === "pl7.app/vdj/scClonotypeKey")
          return "antibody_tcr";
      }
      // Fallback when the input is resolved but unrecognized.
      return "antibody_tcr";
    },
    { retentive: true },
  )

  .output("inputState", (ctx): boolean | undefined => {
    // Not-ready-safe read — getDataAsJson throws mid-run here on remote backends (MILAB-6318).
    const inputState = ctx.outputs?.resolve("isEmpty")?.getDataAsJsonOrUndefined<unknown>();
    if (typeof inputState === "boolean") {
      return inputState;
    }
    return undefined;
  })

  .output("minPeptideLength", (ctx): number | undefined => {
    // Not-ready-safe read — getDataAsJson throws mid-run here on remote backends (MILAB-6318).
    const data = ctx.outputs
      ?.resolve({ field: "minPeptideLength", allowPermanentAbsence: true })
      ?.getDataAsJsonOrUndefined<{ min_len: number | null }>();
    return data?.min_len ?? undefined;
  })

  .outputWithStatus("clustersTable", (ctx) => {
    const pCols = ctx.outputs?.resolve("clustersPf")?.getPColumns();
    if (pCols === undefined) return undefined;
    return createPlDataTableV2(ctx, pCols, ctx.data.tableState);
  })

  .output("mmseqsOutput", (ctx) => ctx.outputs?.resolve("mmseqsOutput")?.getLogHandle())

  .output("msaPf", (ctx) => {
    const msaCols = ctx.outputs?.resolve("msaPf")?.getPColumns();
    if (!msaCols) return undefined;

    // When trimming is enabled, use trimmed sequences from msaPf only
    const trimEnabled = (ctx.data.trimStart ?? 0) > 0 || (ctx.data.trimEnd ?? 0) > 0;
    if (trimEnabled) {
      return createPFrameForGraphs(ctx, msaCols);
    }

    const datasetRef = ctx.data.datasetRef;
    if (datasetRef === undefined) return undefined;

    const sequencesRef = ctx.data.sequencesRef;
    if (sequencesRef.length === 0) return undefined;

    const seqCols = ctx.resultPool.getAnchoredPColumns(
      { main: datasetRef },
      sequencesRef.map((s) => JSON.parse(s) as never),
    );
    if (seqCols === undefined) return undefined;

    return createPFrameForGraphs(ctx, [...msaCols, ...seqCols]);
  })

  .output("linkerColumnId", (ctx) => {
    const pCols = ctx.outputs?.resolve("msaPf")?.getPColumns();
    if (!pCols) return undefined;
    return pCols.find((p) => p.spec.annotations?.["pl7.app/isLinkerColumn"] === "true")?.id;
  })

  .output("clusterAbundanceSpec", (ctx) => {
    // Not-ready-safe read — getDataAsJson throws mid-run here on remote backends (MILAB-6318).
    return ctx.outputs?.resolve("clusterAbundanceSpec")?.getDataAsJsonOrUndefined<PColumnSpec>();
  })

  .output("inputSpec", (ctx) => {
    const anchor = ctx.data.datasetRef;
    if (anchor === undefined) return undefined;
    const anchorSpec = ctx.resultPool.getPColumnSpecByRef(anchor);
    if (anchorSpec === undefined) return undefined;
    return anchorSpec;
  })

  .outputWithStatus("clustersPf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve("pf")?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .outputWithStatus("centroidDatasetPf", (ctx): PFrameHandle | undefined => {
    // centroidDatasetPf is only exported by the workflow when the "Generate centroid
    // dataset" checkbox is on (peptide inputs); allowPermanentAbsence so resolving it
    // when off returns undefined instead of throwing "input field not found".
    const pCols = ctx.outputs
      ?.resolve({ field: "centroidDatasetPf", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .outputWithStatus("bubblePlotPf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve("bubblePlotPf")?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output("bubblePlotPfPcols", (ctx) => {
    const pCols = ctx.outputs?.resolve("bubblePlotPf")?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        }) satisfies PColumnIdAndSpec,
    );
  })

  // Returns a list of Pcols for plot defaults
  .output("clustersPfPcols", (ctx) => {
    const pCols = ctx.outputs?.resolve("pf")?.getPColumns();
    if (pCols === undefined || pCols.length === 0) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        }) satisfies PColumnIdAndSpec,
    );
  })

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .title(() => "Sequence Clustering")

  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel)

  .sections((_ctx) => [
    { type: "link", href: "/", label: strings.titles.main },
    { type: "link", href: "/bubble", label: "Most Abundant Clusters" },
    { type: "link", href: "/histogram", label: "Cluster Size Histogram" },
  ])

  .done();
