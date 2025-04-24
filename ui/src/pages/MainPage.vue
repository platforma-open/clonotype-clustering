<script setup lang="ts">
import type {
  PlDataTableSettings,
} from '@platforma-sdk/ui-vue';
import {
  PlAgDataTable,
  PlAgDataTableToolsPanel,
  PlBlockPage,
  PlBtnGhost,
  PlCheckbox,
  PlDropdown,
  PlDropdownRef,
  PlMaskIcon24,
  PlNumberField,
  PlSlideModal,
} from '@platforma-sdk/ui-vue';
import { computed } from 'vue';
import { useApp } from '../app';

const app = useApp();

const tableSettings = computed<PlDataTableSettings>(() => ({
  sourceType: 'ptable',
  pTable: app.model.outputs.metricsTable,
}));

const metricOptions = [
  { text: 'Levenshtein', value: 'levenshtein' },
  { text: 'Alignment', value: 'alignment' },
];

</script>

<template>
  <PlBlockPage>
    <template #title>
      Clonotype Clustering{{ app.model.ui.title ? ` - ${app.model.ui.title}` : '' }}
    </template>
    <template #append>
      <PlAgDataTableToolsPanel/>
      <PlBtnGhost @click.stop="() => (app.model.ui.settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <PlAgDataTable
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      show-columns-panel
      show-export-button
    />
    <PlSlideModal v-model="app.model.ui.settingsOpen" :close-on-outside-click="true">
      <template #title>Settings</template>
      <PlDropdownRef
        v-model="app.model.args.aaSeqCDR3Ref"
        :options="app.model.outputs.cdr3Options"
        label="Select dataset"
        clearable
      />
      <PlDropdown v-model="app.model.args.metric" :options="metricOptions" label="Select metric" />
      <PlNumberField
        v-model="app.model.args.resolution"
        label="Resolution" :minValue="0.1" :step="0.1"
      >
        <template #tooltip>
          Select resolution for clustering. The bigger the resolution, the more clusters will be found.
        </template>
      </PlNumberField>

      <PlCheckbox
        v-if="app.model.outputs.isSingleCell"
        v-model="app.model.args.clusterBothChains"
      >
        Cluster both chains
      </PlCheckbox>
    </PlSlideModal>
  </PlBlockPage>
</template>
