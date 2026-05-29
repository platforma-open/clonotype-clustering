import type { GraphMakerState } from '@milaboratories/graph-maker';
import strings from '@milaboratories/strings';
import type {
  ColumnUniversalId,
  PColumnIdAndSpec,
  PColumnSpec,
  PFrameHandle,
  PlDataTableStateV2,
  PlMultiSequenceAlignmentModel,
  PlRef,
  PObjectId,
  RelaxedColumnSelector,
  SUniversalPColumnId,
} from '@platforma-sdk/model';
import {
  BlockModelV3,
  Column,
  ColumnsCollection,
  DataModelBuilder,
  createGlobalPObjectId,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV2,
  extractPObjectId,
  getColumnOptions,
  isPlRef,
  parseColumnId,
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
  datasetRef?: ColumnUniversalId;
  sequencesRef: ColumnUniversalId[];
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
    // Legacy `datasetRef` was a `PlRef`. The new `BlockData` carries a
    // `ColumnUniversalId` — for result-pool leaves that is
    // `createGlobalPObjectId(blockId, name)`.
    datasetRef: args.datasetRef
      ? createGlobalPObjectId(args.datasetRef.blockId, args.datasetRef.name)
      : undefined,
    // `SUniversalPColumnId` is a type alias for `ColumnUniversalId` — same wire
    // string. No conversion needed.
    sequencesRef: args.sequencesRef as readonly ColumnUniversalId[] as ColumnUniversalId[],
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
    coverageThreshold: 0.8,
    coverageMode: 0,
    highPrecision: false,
    trimStart: 0,
    trimEnd: 0,
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

// Anchor candidates: (sampleId × clonotype-key-variant) pairs carrying
// `pl7.app/isAnchor: 'true'`. Discovery runs host-side via
// `ColumnsCollection.filter`; `getColumnOptions` renders distinct labels.
const datasetSelectors: RelaxedColumnSelector[] = [
  {
    axes: [
      { name: [{ type: 'exact', value: 'pl7.app/sampleId' }] },
      { name: [{ type: 'exact', value: 'pl7.app/vdj/clonotypeKey' }] },
    ],
    annotations: { 'pl7.app/isAnchor': 'true' },
  },
  {
    axes: [
      { name: [{ type: 'exact', value: 'pl7.app/sampleId' }] },
      { name: [{ type: 'exact', value: 'pl7.app/vdj/scClonotypeKey' }] },
    ],
    annotations: { 'pl7.app/isAnchor': 'true' },
  },
  {
    axes: [
      { name: [{ type: 'exact', value: 'pl7.app/sampleId' }] },
      { name: [{ type: 'exact', value: 'pl7.app/variantKey' }] },
    ],
    annotations: { 'pl7.app/isAnchor': 'true' },
  },
];

// Workflow-tengo's `addAnchor` / `addSingle` still consume the legacy
// `PlRef` shape (object for anchors, canonical global-ref string for singles).
// Walk the new `ColumnUniversalId` down to its leaf and assert it is a
// global pool ref — anything else cannot be expressed in the current
// workflow API and must surface as an error here, not as a tengo crash.
function toGlobalLeaf(
  id: ColumnUniversalId,
  field: string,
): { ref: PlRef; id: PObjectId } {
  const leafId = extractPObjectId(id);
  const leafKey = parseColumnId(leafId);
  if (!isPlRef(leafKey)) {
    throw new Error(
      `${field}: expected a global pool reference, got ${JSON.stringify(leafKey)}`,
    );
  }
  return { ref: leafKey, id: leafId };
}

export const platforma = BlockModelV3.create(dataModel)

  .args((data) => {
    if (!data.datasetRef) throw new Error('Dataset is required');
    if (!data.sequencesRef.length) throw new Error('Sequences are required');
    return {
      defaultBlockLabel: data.defaultBlockLabel,
      customBlockLabel: data.customBlockLabel,
      datasetRef: toGlobalLeaf(data.datasetRef, 'datasetRef').ref,
      sequencesRef: data.sequencesRef.map((s) => toGlobalLeaf(s, 'sequencesRef').id),
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

  .output('datasetOptions', () =>
    getColumnOptions(
      ColumnsCollection(['result_pool']).filter({ include: datasetSelectors }),
      // suppress native label to show only the dataset label
      { includeNativeLabel: false },
    ),
  )

  .output('sequenceOptions', (ctx) => {
    const datasetId = ctx.data.datasetRef;
    if (datasetId === undefined) return undefined;

    const anchorSpec = Column(datasetId)?.getSpec();
    if (anchorSpec === undefined) return undefined;

    const axis1Name = anchorSpec.axesSpec[1].name;
    const axis1NameSelector: { type: 'exact'; value: string }[] = [
      { type: 'exact', value: axis1Name },
    ];
    const isPeptide = axis1Name === 'pl7.app/variantKey';
    const isSingleCell = axis1Name === 'pl7.app/vdj/scClonotypeKey';

    const sequenceMatchers: RelaxedColumnSelector[] = [];

    if (isPeptide) {
      sequenceMatchers.push({
        axes: [{ name: axis1NameSelector }],
        name: [{ type: 'exact', value: 'pl7.app/sequence' }],
        domain: {
          'pl7.app/feature': 'peptide',
          'pl7.app/alphabet': ctx.data.sequenceType,
        },
      });
    } else {
      if (isSingleCell) {
        sequenceMatchers.push({
          axes: [{ name: axis1NameSelector }],
          name: [{ type: 'exact', value: 'pl7.app/vdj/sequence' }],
          domain: {
            'pl7.app/vdj/scClonotypeChain/index': 'primary',
            'pl7.app/alphabet': ctx.data.sequenceType,
          },
        });
      } else {
        sequenceMatchers.push({
          axes: [{ name: axis1NameSelector }],
          name: [{ type: 'exact', value: 'pl7.app/vdj/sequence' }],
          domain: {
            'pl7.app/alphabet': ctx.data.sequenceType,
          },
        });
      }

      // Conditional scFv inclusion: probe the anchored discovery for any
      // `pl7.app/vdj/scFv-sequence` columns; add the matcher only if present.
      const scFvCount = ColumnsCollection(['result_pool'])
        .discover({
          anchors: { main: anchorSpec },
          mode: 'enrichment',
          include: [{ name: [{ type: 'exact', value: 'pl7.app/vdj/scFv-sequence' }] }],
        })
        .getColumns().length;

      if (scFvCount > 0) {
        sequenceMatchers.push({
          axes: [{ name: axis1NameSelector }],
          name: [{ type: 'exact', value: 'pl7.app/vdj/scFv-sequence' }],
          domain: {
            'pl7.app/alphabet': ctx.data.sequenceType,
          },
        });
      }
    }

    return getColumnOptions(
      ColumnsCollection(['result_pool']).discover({
        anchors: { main: anchorSpec },
        mode: 'enrichment',
        include: sequenceMatchers,
      }),
      { includeNativeLabel: true },
    );
  })

  .output('isSingleCell', (ctx) => {
    if (ctx.data.datasetRef === undefined) return undefined;
    const spec = Column(ctx.data.datasetRef)?.getSpec();
    if (spec === undefined) return undefined;
    return spec.axesSpec[1].name === 'pl7.app/vdj/scClonotypeKey';
  })

  .output('modality', (ctx) => {
    const spec = ctx.data.datasetRef
      ? Column(ctx.data.datasetRef)?.getSpec()
      : undefined;
    if (!spec) return undefined;
    for (const ax of spec.axesSpec) {
      if (ax.name === 'pl7.app/variantKey') return 'peptide';
      if (ax.name === 'pl7.app/vdj/clonotypeKey' || ax.name === 'pl7.app/vdj/scClonotypeKey') return 'antibody_tcr';
    }
    return 'antibody_tcr';
  }, { retentive: true })

  .output('inputState', (ctx): boolean | undefined => {
    const inputState = ctx.outputs?.resolve('isEmpty')?.getDataAsJson() as object;
    if (typeof inputState === 'boolean') {
      return inputState;
    }
    return undefined;
  })

  .outputWithStatus('clustersTable', (ctx) => {
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

    if (ctx.data.datasetRef === undefined) return undefined;

    const sequencesRef = ctx.data.sequencesRef;
    if (sequencesRef.length === 0) return undefined;

    // `sequencesRef` ids may resolve to wrapped recipes (no PColumn form);
    // hand them to `createPFrame` as ids and let the host materialize them.
    // This skips the linker/label enrichment from `createPFrameForGraphs`,
    // but msaCols already carry the joinable axis set the MSA viewer needs.
    return ctx.createPFrame([...msaCols, ...sequencesRef]);
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
    if (ctx.data.datasetRef === undefined) return undefined;
    return Column(ctx.data.datasetRef)?.getSpec();
  })

  .outputWithStatus('clustersPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('pf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .outputWithStatus('bubblePlotPf', (ctx): PFrameHandle | undefined => {
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
