import type { GraphMakerState } from '@milaboratories/graph-maker';
import type {
  InferOutputsType,
  PColumnIdAndSpec,
  PColumnSpec,
  PFrameHandle,
  PlDataTableStateV2,
  PlMultiSequenceAlignmentModel,
  PlRef, SUniversalPColumnId,
} from '@platforma-sdk/model';
import {
  BlockModel,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV2,
} from '@platforma-sdk/model';

export type BlockArgs = {
  datasetRef?: PlRef;
  sequencesRef: SUniversalPColumnId[];
  // Added sequenceType here for future use in algorithm selection in workflow
  sequenceType: 'aminoacid' | 'nucleotide';
  identity: number;
  similarityType: 'alignment-score' | 'sequence-identity';
  coverageThreshold: number; // fraction of aligned residues required
  coverageMode: 0 | 1 | 2 | 3 | 4 | 5; // Complex option. Not available to user
  mem?: number;
  cpu?: number;
};

export type UiState = {
  title?: string;
  tableState: PlDataTableStateV2;
  graphStateBubble: GraphMakerState;
  alignmentModel: PlMultiSequenceAlignmentModel;
  graphStateHistogram: GraphMakerState;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    identity: 0.8,
    sequenceType: 'aminoacid',
    sequencesRef: [],
    similarityType: 'sequence-identity',
    coverageThreshold: 0.8, // default value matching MMseqs2 default
    coverageMode: 0, // default to coverage of query and target
  })

  .withUiState<UiState>({
    title: 'Clonotype Clustering',
    tableState: createPlDataTableStateV2(),
    graphStateBubble: {
      title: 'Top Clusters Plot',
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
      title: 'Histogram',
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
  })

  .argsValid((ctx) => ctx.args.datasetRef !== undefined
    && ctx.args.sequencesRef.length > 0)

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
    }],
    {
      // suppress native label of the column (e.g. "Number of Reads") to show only the dataset label
      label: { includeNativeLabel: false },
    }),
  )

  .output('sequenceOptions', (ctx) => {
    const ref = ctx.args.datasetRef;
    if (ref === undefined) return undefined;

    const isSingleCell = ctx.resultPool.getPColumnSpecByRef(ref)?.axesSpec[1].name === 'pl7.app/vdj/scClonotypeKey';

    // Check if any PColumns in the dataset have the name "pl7.app/vdj/scFv-sequence"
    const scfvColumns = ctx.resultPool.getAnchoredPColumns(
      { main: ref },
      [{
        name: 'pl7.app/vdj/scFv-sequence',
      }],
    );
    const isScfv = scfvColumns && scfvColumns.length > 0;

    const sequenceMatchers = [];
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
          'pl7.app/alphabet': ctx.args.sequenceType,
        },
      });
    } else {
      sequenceMatchers.push({
        axes: [{ anchor: 'main', idx: 1 }],
        name: 'pl7.app/vdj/sequence',
        domain: {
          // 'pl7.app/vdj/feature': feature,
          'pl7.app/alphabet': ctx.args.sequenceType,
        },
      });
    }

    // Add scFv sequence matcher if scFv columns exist in the dataset
    if (isScfv) {
      sequenceMatchers.push({
        axes: [{ anchor: 'main', idx: 1 }],
        name: 'pl7.app/vdj/scFv-sequence',
        domain: {
          'pl7.app/alphabet': ctx.args.sequenceType,
        },
      });
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
    if (ctx.args.datasetRef === undefined) return undefined;

    const spec = ctx.resultPool.getPColumnSpecByRef(ctx.args.datasetRef);
    if (spec === undefined) {
      return undefined;
    }

    return spec.axesSpec[1].name === 'pl7.app/vdj/scClonotypeKey';
  })

  .output('inputState', (ctx): boolean | undefined => {
    const inputState = ctx.outputs?.resolve('isEmpty')?.getDataAsJson() as object;
    if (typeof inputState === 'boolean') {
      return inputState;
    }
    return undefined;
  })

  .output('clustersTable', (ctx) => {
    const pCols = ctx.outputs?.resolve('clustersPf')?.getPColumns();
    if (pCols === undefined) return undefined;
    return createPlDataTableV2(ctx, pCols, ctx.uiState.tableState);
  })

  .output('mmseqsOutput', (ctx) => ctx.outputs?.resolve('mmseqsOutput')?.getLogHandle())

  .output('msaPf', (ctx) => {
    const msaCols = ctx.outputs?.resolve('msaPf')?.getPColumns();
    if (!msaCols) return undefined;

    const datasetRef = ctx.args.datasetRef;
    if (datasetRef === undefined)
      return undefined;

    const sequencesRef = ctx.args.sequencesRef;
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
    const anchor = ctx.args.datasetRef;
    if (anchor === undefined)
      return undefined;
    const anchorSpec = ctx.resultPool.getPColumnSpecByRef(anchor);
    if (anchorSpec === undefined)
      return undefined;
    return anchorSpec;
  })

  .output('clustersPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('pf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('bubblePlotPf', (ctx): PFrameHandle | undefined => {
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

  .title((ctx) => ctx.uiState?.title ?? 'Clonotype Clustering')

  .sections((_ctx) => [
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/bubble', label: 'Top Clusters Plot' },
    { type: 'link', href: '/histogram', label: 'Cluster Size Histogram' },
  ])

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
