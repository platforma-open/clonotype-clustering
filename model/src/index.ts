import type { GraphMakerState } from '@milaboratories/graph-maker';
import type { InferOutputsType, PFrameHandle, PlDataTableState, PlRef } from '@platforma-sdk/model';
import { BlockModel, createPFrameForGraphs, createPlDataTable, isPColumnSpec } from '@platforma-sdk/model';

export type BlockArgs = {
  name?: string;
  aaSeqCDR3Ref?: PlRef;
  metric?: string;
  resolution: number;
  clusterBothChains: boolean;
};

export type UiState = {
  title?: string;
  tableState: PlDataTableState;
  settingsOpen: boolean;
  graphStateUMAP: GraphMakerState;
  graphStateTSNE: GraphMakerState;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    metric: 'levenshtein',
    resolution: 1.0,
    clusterBothChains: true,
  })

  .withUiState<UiState>({
    title: 'Clonotype Clustering',
    settingsOpen: true,
    tableState: {
      gridState: {},
    },
    graphStateUMAP: {
      title: 'UMAP',
      template: 'dots',
    },
    graphStateTSNE: {
      title: 'tSNE',
      template: 'dots',
    },
  })

  .output('cdr3Options', (ctx) =>
    ctx.resultPool.getOptions((c) =>
      isPColumnSpec(c)
      && c.valueType === 'String'
      && c.name === 'pl7.app/vdj/sequence'
      && c.domain?.['pl7.app/vdj/feature'] === 'CDR3'
      && c.domain?.['pl7.app/alphabet'] === 'aminoacid'
      && (!c.domain?.['pl7.app/vdj/scClonotypeChain'] || c.domain?.['pl7.app/vdj/scClonotypeChain'] === 'A')
      && (!c.domain?.['pl7.app/vdj/scClonotypeChain/index'] || c.domain?.['pl7.app/vdj/scClonotypeChain/index'] === 'primary'),
    ))

  .output('isSingleCell', (ctx) => {
    if (ctx.args.aaSeqCDR3Ref === undefined)
      return undefined;

    const spec = ctx.resultPool.getPColumnSpecByRef(ctx.args.aaSeqCDR3Ref);
    if (spec === undefined) {
      return undefined;
    }

    return spec.axesSpec[0].name === 'pl7.app/vdj/scClonotypeKey';
  })

  // Clustering result table
  .output('table', (ctx) => {
    if (ctx.args.aaSeqCDR3Ref === undefined)
      return undefined;
  })

  .output('clustersPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('clustersPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('UMAPPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('UMAPPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

// .output('TSNEPf', (ctx): PFrameHandle | undefined => {
//   const pCols = ctx.outputs?.resolve('TSNEPf')?.getPColumns();
//   if (pCols === undefined) {
//     return undefined;
//   }

//   return createPFrameForGraphs(ctx, pCols);
// })

  .output('clustersTable', (ctx) => {
    const pCols = ctx.outputs?.resolve('clustersPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPlDataTable(ctx, pCols, ctx.uiState?.tableState);
  })

  .output('metricsTable', (ctx) => {
    const pCols = ctx.outputs?.resolve('metricsPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPlDataTable(ctx, pCols, ctx.uiState?.tableState);
  })

  .output('isRunning', (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .sections((_ctx) => ([
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/umap', label: 'UMAP' },
  ]))

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
