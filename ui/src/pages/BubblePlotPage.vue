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
      inputName: 'valueColor',
      selectedSource: {
        kind: 'PColumn',
        name: 'pl7.app/vdj/clustering/clusterSize',
        valueType: 'Int',
        axesSpec: [],
      },
    },
    {
      inputName: 'valueSize',
      selectedSource: app.model.outputs.clusterAbundanceSpec, // @TODO: figure out why this is not working (Elena)
      // If switch to search mode use more queries to get only "pl7.app/label": "Number of UMIs in cluster" and not
      // "pl7.app/label": "Number of UMIs",
      // selectedSource: {
      //   kind: 'PColumn',
      //   name: app.model.outputs.clusterAbundanceSpec.name,
      //   valueType: app.model.outputs.clusterAbundanceSpec.valueType,
      //   axesSpec: [],
      // },
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
      selectedFilterRange: { min: 3 },
    },
  ];
});

</script>

<template>
  <PlBlockPage>
    <GraphMaker
      v-model="app.model.ui.graphStateBubble"
      chartType="bubble"
      :data-state-key="app.model.outputs.clustersPf"
      :p-frame="app.model.outputs.clustersPf"
      :default-options="defaultOptions"
    />
  </PlBlockPage>
</template>
