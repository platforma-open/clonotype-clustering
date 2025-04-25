<script setup lang="ts">
import '@milaboratories/graph-maker/styles';
import { PlBlockPage } from '@platforma-sdk/ui-vue';
import { useApp } from '../app';

import type { GraphMakerProps } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';

const app = useApp();

const defaultOptions: GraphMakerProps['defaultOptions'] = [
  {
    inputName: 'x',
    selectedSource: {
      kind: 'PColumn',
      name: 'pl7.app/vdj/clusteringUmap1',
      valueType: 'Double',
      axesSpec: [
        {
          name: 'pl7.app/vdj/clonotypeKey',
          type: 'String',
        },
      ],
    },
  },
  {
    inputName: 'y',
    selectedSource: {
      kind: 'PColumn',
      name: 'pl7.app/vdj/clusteringUmap2',
      valueType: 'Double',
      axesSpec: [
        {
          name: 'pl7.app/vdj/clonotypeKey',
          type: 'String',
        },
      ],
    },
  },
  {
    inputName: 'grouping',
    selectedSource: {
      kind: 'PColumn',
      name: 'pl7.app/vdj/clonotypeCluster',
      valueType: 'String',
      axesSpec: [
        {
          name: 'pl7.app/vdj/clonotypeKey',
          type: 'String',
        },
      ],
    },
  },
];

</script>

<template>
  <PlBlockPage>
    <GraphMaker
      v-model="app.model.ui.graphStateUmap" chartType="scatterplot-umap"
      :p-frame="app.model.outputs.umapPf" :default-options="defaultOptions"
    />
  </PlBlockPage>
</template>
