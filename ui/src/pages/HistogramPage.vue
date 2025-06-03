<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import { PlBlockPage } from '@platforma-sdk/ui-vue';
import { useApp } from '../app';

const app = useApp();

const defaultOptions: PredefinedGraphOption<'histogram'>[] = [
  {
    inputName: 'value',
    selectedSource: {
      kind: 'PColumn',
      name: 'pl7.app/vdj/clustering/clusterSize',
      valueType: 'Int',
      axesSpec: [],
    },
  },
];

</script>

<template>
  <PlBlockPage>
    <GraphMaker
      v-model="app.model.ui.graphStateHistogram"
      chartType="histogram"
      :p-frame="app.model.outputs.clustersPf"
      :default-options="defaultOptions"
    />
  </PlBlockPage>
</template>
