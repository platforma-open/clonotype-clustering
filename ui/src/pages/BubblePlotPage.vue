<script setup lang="ts">
import '@milaboratories/graph-maker/styles';
import { PlBlockPage } from '@platforma-sdk/ui-vue';
import { useApp } from '../app';

import type { GraphMakerProps } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import { computed } from 'vue';

const app = useApp();

const defaultOptions = computed((): GraphMakerProps['defaultOptions'] => {
  if (app.model.outputs.clusterAbundanceSpec === undefined) return undefined;
  return [
    {
      inputName: 'valueSize',
      selectedSource: {
        kind: 'PColumn',
        name: 'pl7.app/vdj/clustering/clusterSize',
        valueType: 'Int',
        axesSpec: [],
      },
    },
    {
      inputName: 'valueColor',
      selectedSource: app.model.outputs.clusterAbundanceSpec,
    },
    {
      inputName: 'y',
      selectedSource: {
        name: 'pl7.app/sampleId',
        type: 'String',
      },
    },
    {
      inputName: 'x',
      selectedSource: {
        name: 'pl7.app/vdj/clusterId',
        type: 'String',
      },
    },
    {
      inputName: 'filters',
      selectedSource: {
        kind: 'PColumn',
        name: 'pl7.app/vdj/clustering/clusterSize',
        valueType: 'Int',
        axesSpec: [],
      },
      selectedFilterRange: {
        min: 3,
        max: 1000000, // @TODO allow max undefined
      },
    },
  ];
});

</script>

<template>
  <PlBlockPage>
    <GraphMaker
      v-model="app.model.ui.graphStateBubble"
      chartType="bubble"
      :p-frame="app.model.outputs.clustersPf"
      :default-options="defaultOptions"
    />
  </PlBlockPage>
</template>
