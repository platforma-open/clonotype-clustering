import type { GraphMakerState } from '@milaboratories/graph-maker';
import strings from '@milaboratories/strings';
import type {
  PColumnIdAndSpec,
  PColumnSpec,
  PFrameHandle,
  PlDataTableStateV2,
  PlMultiSequenceAlignmentModel,
  PlRef, SUniversalPColumnId,
} from '@platforma-sdk/model';
import {
  BlockModelV3,
  DataModelBuilder,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV2,
} from '@platforma-sdk/model';
export type * from '@milaboratories/helpers';

/** Map user-facing similarity type to mmseqs2 similarity type */
export const similarityTypeOptions = [
  { label: 'Exact Match', value: 'sequence-identity' },
  { label: 'BLOSUM40', value: 'blosum40' },
  { label: 'BLOSUM50', value: 'blosum50' },
  { label: 'BLOSUM62', value: 'blosum62' },
  { label: 'BLOSUM80', value: 'blosum80' },
  { label: 'BLOSUM90', value: 'blosum90' },
] as const;

export const clusteringToolOptions = [
  { label: 'Easy Cluster', value: 'easy-cluster' },
  { label: 'Easy Linclust', value: 'easy-linclust' },
] as const;

type OldArgs = {
  defaultBlockLabel: string;
  customBlockLabel: string;
  datasetRef?: PlRef;
  sequencesRef: SUniversalPColumnId[];
  // Added sequenceType here for future use in algorithm selection in workflow
  sequenceType: 'aminoacid' | 'nucleotide';
  identity: number;
  similarityType: 'sequence-identity' | 'blosum40' | 'blosum50' | 'blosum62' | 'blosum80' | 'blosum90';
  coverageThreshold: number; // fraction of aligned residues required
  coverageMode: 0 | 1 | 2 | 3 | 4 | 5; // Complex option. Not available to user
  highPrecision: boolean; // use high-precision mmseqs2 settings (suitable for short sequences like CDR3)
  trimStart?: number; // number of amino acids to remove from the beginning
  trimEnd?: number; // number of amino acids to remove from the end
  clusteringTool: 'easy-cluster' | 'easy-linclust';
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
  sequenceType: 'aminoacid' | 'nucleotide';
  identity: number;
  similarityType: 'sequence-identity' | 'blosum40' | 'blosum50' | 'blosum62' | 'blosum80' | 'blosum90';
  coverageThreshold: number; // fraction of aligned residues required
  coverageMode: 0 | 1 | 2 | 3 | 4 | 5; // Complex option. Not available to user
  highPrecision: boolean; // use high-precision mmseqs2 settings (suitable for short sequences like CDR3)
  trimStart?: number; // number of amino acids to remove from the beginning
  trimEnd?: number; // number of amino acids to remove from the end
  clusteringTool: 'easy-cluster' | 'easy-linclust';
  mem?: number;
  cpu?: number;
  tableState: PlDataTableStateV2;
  graphStateBubble: GraphMakerState;
  alignmentModel: PlMultiSequenceAlignmentModel;
  graphStateHistogram: GraphMakerState;
};

export function getDefaultBlockLabel(data: {
  sequenceLabels: string[];
  similarityType: BlockData['similarityType'];
  identity: number;
  coverageThreshold: number;
  trimStart: number;
  trimEnd: number;
}) {
  const parts: string[] = [];
  parts.push(data.sequenceLabels.join(' - '));
  parts.push(
    similarityTypeOptions
      .find((o) => o.value === data.similarityType)
      ?.label ?? 'BLOSUM62',
  );
  parts.push(`ident:${data.identity}`);
  parts.push(`cov:${data.coverageThreshold}`);
  if (data.trimStart > 0) {
    parts.push(`trimStart: ${data.trimStart}`);
  }
  if (data.trimEnd > 0) {
    parts.push(`trimEnd: ${data.trimEnd}`);
  }
  return parts.filter(Boolean).join(', ');
}

const defaultSimilarityType = similarityTypeOptions[3];

const dataModel = new DataModelBuilder()
  .from<BlockData>('v1')
  .upgradeLegacy<OldArgs, OldUiState>(({ args, uiState }) => ({
    ...args,
    similarityType: (args.similarityType as string) === 'alignment-score' ? 'blosum62' : args.similarityType,
    tableState: uiState.tableState,
    graphStateBubble: uiState.graphStateBubble,
    alignmentModel: uiState.alignmentModel,
    graphStateHistogram: uiState.graphStateHistogram,
  }))
  .init(() => ({
    defaultBlockLabel: getDefaultBlockLabel({
      sequenceLabels: [],
      similarityType: defaultSimilarityType.value,
      identity: 0.8,
      coverageThreshold: 0.8,
      trimStart: 0,
      trimEnd: 0,
    }),
    customBlockLabel: '',
    sequencesRef: [],
    sequenceType: 'aminoacid',
    identity: 0.8,
    similarityType: defaultSimilarityType.value,
    coverageThreshold: 0.8, // default value matching MMseqs2 default
    coverageMode: 0, // default to coverage of query and target
    highPrecision: false, // default to off, can be enabled manually in advanced settings
    trimStart: 0, // default to no trimming from start
    trimEnd: 0, // default to no trimming from end
    clusteringTool: 'easy-cluster',
    tableState: createPlDataTableStateV2(),
    graphStateBubble: {
      title: 'Most abundant clusters',
      template: 'bubble',
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
      template: 'bins',
      currentTab: null,
      layersSettings: {
        bins: { fillColor: '#99e099' },
      },
      axesSettings: {
        axisY: {
          axisLabelsAngle: 90,
          scale: 'log',
        },
        other: { binsCount: 30 },
      },
    },
  }));

export const platforma = BlockModelV3.create(dataModel)

  .args((data) => {
    if (!data.datasetRef) throw new Error('Dataset is required');
    if (!data.sequencesRef.length) throw new Error('Sequences are required');
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
      mem: data.mem,
      cpu: data.cpu,
    };
  })

  .output('datasetOptions', (ctx) =>
    ctx.resultPool.getOptions([{
      axes: [
        { name: 'pl7.app/sampleId' },
        { name: 'pl7.app/vdj/clonotypeKey' },
      ],
      annotations: { 'pl7.app/isAnchor': 'true' },
    }, {
      axes: [
        { name: 'pl7.app/sampleId' },
        { name: 'pl7.app/vdj/scClonotypeKey' },
      ],
      annotations: { 'pl7.app/isAnchor': 'true' },
    }, {
      axes: [
        { name: 'pl7.app/sampleId' },
        { name: 'pl7.app/variantKey' },
      ],
      annotations: { 'pl7.app/isAnchor': 'true' },
    }],
    {
      // suppress native label of the column (e.g. "Number of Reads") to show only the dataset label
      label: { includeNativeLabel: false },
    }),
  )

  .output('sequenceOptions', (ctx) => {
    const ref = ctx.data.datasetRef;
    if (ref === undefined) return undefined;

    const axis1Name = ctx.resultPool.getPColumnSpecByRef(ref)?.axesSpec[1].name;
    const isPeptide = axis1Name === 'pl7.app/variantKey';
    const isSingleCell = axis1Name === 'pl7.app/vdj/scClonotypeKey';

    const sequenceMatchers = [];

    if (isPeptide) {
      sequenceMatchers.push({
        axes: [{ anchor: 'main', idx: 1 }],
        name: 'pl7.app/sequence',
        domain: {
          'pl7.app/feature': 'peptide',
          'pl7.app/alphabet': ctx.data.sequenceType,
        },
      });
    } else {
      // const allowedFeatures = ['CDR1', 'CDR2', 'CDR3', 'FR1', 'FR2',
      //   'FR3', 'FR4', 'FR4InFrame', 'VDJRegion', 'VDJRegionInFrame'];
      // for (const feature of allowedFeatures) {
      if (isSingleCell) {
        sequenceMatchers.push({
          axes: [{ anchor: 'main', idx: 1 }],
          name: 'pl7.app/vdj/sequence',
          domain: {
            // 'pl7.app/vdj/feature': feature,
            'pl7.app/vdj/scClonotypeChain/index': 'primary',
            'pl7.app/alphabet': ctx.data.sequenceType,
          },
        });
      } else {
        sequenceMatchers.push({
          axes: [{ anchor: 'main', idx: 1 }],
          name: 'pl7.app/vdj/sequence',
          domain: {
            // 'pl7.app/vdj/feature': feature,
            'pl7.app/alphabet': ctx.data.sequenceType,
          },
        });
      }

      // Check if any PColumns in the dataset have the name "pl7.app/vdj/scFv-sequence"
      const scfvColumns = ctx.resultPool.getAnchoredPColumns(
        { main: ref },
        [{
          name: 'pl7.app/vdj/scFv-sequence',
        }],
      );
      if (scfvColumns && scfvColumns.length > 0) {
        sequenceMatchers.push({
          axes: [{ anchor: 'main', idx: 1 }],
          name: 'pl7.app/vdj/scFv-sequence',
          domain: {
            'pl7.app/alphabet': ctx.data.sequenceType,
          },
        });
      }
    }

    return ctx.resultPool.getCanonicalOptions(
      { main: ref },
      sequenceMatchers,
      { ignoreMissingDomains: true,
        labelOps: {
          includeNativeLabel: true,
        },
      });
  })

  .output('isSingleCell', (ctx) => {
    if (ctx.data.datasetRef === undefined) return undefined;

    const spec = ctx.resultPool.getPColumnSpecByRef(ctx.data.datasetRef);
    if (spec === undefined) {
      return undefined;
    }

    return spec.axesSpec[1].name === 'pl7.app/vdj/scClonotypeKey';
  })

  .output('modality', (ctx) => {
    const spec = ctx.data.datasetRef
      ? ctx.resultPool.getPColumnSpecByRef(ctx.data.datasetRef)
      : undefined;
    if (!spec) return undefined;
    for (const ax of spec.axesSpec) {
      if (ax.name === 'pl7.app/variantKey') return 'peptide';
      if (ax.name === 'pl7.app/vdj/clonotypeKey' || ax.name === 'pl7.app/vdj/scClonotypeKey') return 'antibody_tcr';
    }
    // Fallback when the input is resolved but unrecognized.
    return 'antibody_tcr';
  }, { retentive: true })

  .output('inputState', (ctx): boolean | undefined => {
    const inputState = ctx.outputs?.resolve('isEmpty')?.getDataAsJson() as object;
    if (typeof inputState === 'boolean') {
      return inputState;
    }
    return undefined;
  })

  .retentiveOutputWithStatus('clustersTable', (ctx) => {
    const pCols = ctx.outputs?.resolve('clustersPf')?.getPColumns();
    if (pCols === undefined) return undefined;
    return createPlDataTableV2(ctx, pCols, ctx.data.tableState);
  })

  .output('mmseqsOutput', (ctx) => ctx.outputs?.resolve('mmseqsOutput')?.getLogHandle())

  .output('msaPf', (ctx) => {
    const msaCols = ctx.outputs?.resolve('msaPf')?.getPColumns();
    if (!msaCols) return undefined;

    // When trimming is enabled, use trimmed sequences from msaPf only
    const trimEnabled = (ctx.data.trimStart ?? 0) > 0 || (ctx.data.trimEnd ?? 0) > 0;
    if (trimEnabled) {
      return createPFrameForGraphs(ctx, msaCols);
    }

    const datasetRef = ctx.data.datasetRef;
    if (datasetRef === undefined)
      return undefined;

    const sequencesRef = ctx.data.sequencesRef;
    if (sequencesRef.length === 0)
      return undefined;

    const seqCols = ctx.resultPool.getAnchoredPColumns(
      { main: datasetRef },
      sequencesRef.map((s) => JSON.parse(s) as never),
    );
    if (seqCols === undefined)
      return undefined;

    return createPFrameForGraphs(ctx, [...msaCols, ...seqCols]);
  })

  .output('linkerColumnId', (ctx) => {
    const pCols = ctx.outputs?.resolve('msaPf')?.getPColumns();
    if (!pCols) return undefined;
    return pCols.find((p) => p.spec.annotations?.['pl7.app/isLinkerColumn'] === 'true')?.id;
  })

  .output('clusterAbundanceSpec', (ctx) => {
    const spec = ctx.outputs?.resolve('clusterAbundanceSpec')?.getDataAsJson();
    if (spec === undefined) return undefined;
    return spec as PColumnSpec;
  })

  .output('inputSpec', (ctx) => {
    const anchor = ctx.data.datasetRef;
    if (anchor === undefined)
      return undefined;
    const anchorSpec = ctx.resultPool.getPColumnSpecByRef(anchor);
    if (anchorSpec === undefined)
      return undefined;
    return anchorSpec;
  })

  .retentiveOutputWithStatus('clustersPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('pf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .retentiveOutputWithStatus('bubblePlotPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('bubblePlotPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('bubblePlotPfPcols', (ctx) => {
    const pCols = ctx.outputs?.resolve('bubblePlotPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        } satisfies PColumnIdAndSpec),
    );
  })

  // Returns a list of Pcols for plot defaults
  .output('clustersPfPcols', (ctx) => {
    const pCols = ctx.outputs?.resolve('pf')?.getPColumns();
    if (pCols === undefined || pCols.length === 0) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        } satisfies PColumnIdAndSpec),
    );
  })

  .output('isRunning', (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .title(() => 'Sequence Clustering')

  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel)

  .sections((_ctx) => [
    { type: 'link', href: '/', label: strings.titles.main },
    { type: 'link', href: '/bubble', label: 'Most Abundant Clusters' },
    { type: 'link', href: '/histogram', label: 'Cluster Size Histogram' },
  ])

  .done();
