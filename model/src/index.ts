import type { GraphMakerState } from '@milaboratories/graph-maker';
import type { InferOutputsType, PColumnSpec, PFrameHandle, PlDataTableState, PlRef, SUniversalPColumnId } from '@platforma-sdk/model';
import {
  BlockModel,
  createPFrameForGraphs,
  createPlDataTable,
  isPColumnSpec,
} from '@platforma-sdk/model';

export type BlockArgs = {
  name?: string;
  aaSeqCDR3Ref?: PlRef;
  abundanceRef?: SUniversalPColumnId;
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

  .argsValid((ctx) => ctx.args.aaSeqCDR3Ref !== undefined && ctx.args.abundanceRef !== undefined)

  .output('cdr3Options', (ctx) =>
    ctx.resultPool.getOptions(
      (c) =>
        isPColumnSpec(c)
        && c.valueType === 'String'
        && c.name === 'pl7.app/vdj/sequence'
        && c.domain?.['pl7.app/vdj/feature'] === 'CDR3'
        && c.domain?.['pl7.app/alphabet'] === 'aminoacid'
        && (!c.domain?.['pl7.app/vdj/scClonotypeChain'] || c.domain?.['pl7.app/vdj/scClonotypeChain'] === 'A')
        && (!c.domain?.['pl7.app/vdj/scClonotypeChain/index'] || c.domain?.['pl7.app/vdj/scClonotypeChain/index'] === 'primary'),
    ),
  )

  .output('abundanceOptions', (ctx) => {
    const aaSeqCDR3Ref = ctx.args.aaSeqCDR3Ref;
    if (aaSeqCDR3Ref === undefined) return undefined;

    return ctx.resultPool.getCanonicalOptions({ main: aaSeqCDR3Ref }, {
      axes: [{ name: 'pl7.app/sampleId' }, { anchor: 'main', idx: 0 }],
      annotations: {
        'pl7.app/isAbundance': 'true',
        'pl7.app/abundance/normalized': 'true',
      },
    }, { ignoreMissingDomains: true });
  })

  .output('isSingleCell', (ctx) => {
    if (ctx.args.aaSeqCDR3Ref === undefined) return undefined;

    const spec = ctx.resultPool.getPColumnSpecByRef(ctx.args.aaSeqCDR3Ref);
    if (spec === undefined) {
      return undefined;
    }

    return spec.axesSpec[0].name === 'pl7.app/vdj/scClonotypeKey';
  })

  .output('clustersTable', (ctx) => {
    const pCols = ctx.outputs?.resolve('clustersPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPlDataTable(ctx, pCols, ctx.uiState?.tableState);
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

  .sections((_ctx) => [
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/bubble', label: 'Clusters Plot' },
  ])

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
