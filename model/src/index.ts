import type { GraphMakerState } from '@milaboratories/graph-maker';
import type { InferOutputsType, PColumnSpec, PFrameHandle, PlDataTableState, PlRef, SUniversalPColumnId } from '@platforma-sdk/model';
import {
  BlockModel,
  createPFrameForGraphs,
  createPlDataTableV2,
} from '@platforma-sdk/model';

export type BlockArgs = {
  datasetRef?: PlRef;
  sequenceRef?: SUniversalPColumnId;
  identity: number;
  clusterBothChains: boolean;
};

export type UiState = {
  title?: string;
  tableState: PlDataTableState;
  graphStateBubble: GraphMakerState;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    identity: 0.8,
    clusterBothChains: true,
  })

  .withUiState<UiState>({
    title: 'Clonotype Clustering',
    tableState: {
      gridState: {},
    },
    graphStateBubble: {
      title: 'Clusters Plot',
      template: 'bubble',
      currentTab: null,
      layersSettings: {
        bubble: {
          normalizationDirection: null,
        },
      },
    },
  })

  .argsValid((ctx) => ctx.args.datasetRef !== undefined && ctx.args.sequenceRef !== undefined)

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
    const sequenceMatchers = [];
    for (const feature of ['CDR3', 'VDJRegion']) {
      if (isSingleCell) {
        sequenceMatchers.push({
          axes: [{ anchor: 'main', idx: 1 }],
          name: 'pl7.app/vdj/sequence',
          domain: {
            'pl7.app/vdj/feature': feature,
            'pl7.app/vdj/scClonotypeChain': 'A',
            'pl7.app/vdj/scClonotypeChain/index': 'primary',
          },
        });
      } else {
        sequenceMatchers.push({
          axes: [{ anchor: 'main', idx: 1 }],
          name: 'pl7.app/vdj/sequence',
          domain: {
            'pl7.app/vdj/feature': feature,
          },
        });
      }
    }

    return ctx.resultPool.getCanonicalOptions(
      { main: ref },
      sequenceMatchers,
      { ignoreMissingDomains: true });
  })

  .output('isSingleCell', (ctx) => {
    if (ctx.args.datasetRef === undefined) return undefined;

    const spec = ctx.resultPool.getPColumnSpecByRef(ctx.args.datasetRef);
    if (spec === undefined) {
      return undefined;
    }

    return spec.axesSpec[1].name === 'pl7.app/vdj/scClonotypeKey';
  })

  .output('clustersTable', (ctx) => {
    const pCols = ctx.outputs?.resolve('clustersPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPlDataTableV2(ctx, pCols,
      (_) => true,
      ctx.uiState?.tableState);
  })

  .output('clusterAbundanceSpec', (ctx) => {
    const spec = ctx.outputs?.resolve('clusterAbundanceSpec')?.getDataAsJson();
    if (spec === undefined) return undefined;
    return spec as PColumnSpec;
  })

  .output('clustersPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('pf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('isRunning', (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .title((ctx) => ctx.uiState?.title ?? 'Clonotype Clustering')

  .sections((_ctx) => [
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/bubble', label: 'Clusters Plot' },
  ])

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
