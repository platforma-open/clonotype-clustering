import type { GraphMakerState } from '@milaboratories/graph-maker';
import type { InferOutputsType, PFrameHandle, PlDataTableState, PlRef, PColumn, PColumnSpec, PObjectSpec, TreeNodeAccessor } from '@platforma-sdk/model';
import { BlockModel, createPFrameForGraphs, isPColumnSpec } from '@platforma-sdk/model';

export type BlockArgs = {
  name?: string;
  inputAnchor?: PlRef;
  clonotypingRunId?: string;
  chain?: string;
  dataType?: string;
  title?: string;
};

export type UiState = {
  title?: string;
  tableState: PlDataTableState;
  settingsOpen: boolean;
  graphStateUMAP: GraphMakerState;
  graphStateTSNE: GraphMakerState;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({})

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

  .output('inputOptions', (ctx) =>
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
    }]),
  )

  // Clustering result table
  .output('table', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;
  })

  .output('chainOptions', (ctx) =>
    ctx.resultPool.getOptions((spec) => isPColumnSpec(spec)
      && spec.name === 'pl7.app/vdj/sequence'
      && spec.domain?.['pl7.app/vdj/clonotypingRunId'] === ctx.args.clonotypingRunId
      && spec.domain?.['pl7.app/alphabet'] === 'aminoacid'
      && spec.domain?.['pl7.app/vdj/feature'] === 'CDR3'
      && (spec.domain?.['pl7.app/vdj/scClonotypeChain/index'] === undefined
        || spec.domain?.['pl7.app/vdj/scClonotypeChain/index'] === 'primary')),
  )

  .output('anchorSpecs', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;
    return ctx.resultPool.getPColumnSpecByRef(ctx.args.inputAnchor);
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

  .output('isRunning', (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .sections((_ctx) => ([
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/umap', label: 'UMAP' },
  ]))

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
