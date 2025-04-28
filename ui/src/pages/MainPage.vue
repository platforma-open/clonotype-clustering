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
import { computed, ref } from 'vue';
import { useApp } from '../app';

const app = useApp();

const settingsOpen = ref(app.model.args.aaSeqCDR3Ref === undefined);

const tableSettings = computed<PlDataTableSettings>(() => ({
  sourceType: 'ptable',
  pTable: app.model.outputs.clustersTable,
}));

</script>

<template>
  <PlBlockPage>
    <template #title>
      Clonotype Clustering{{ app.model.ui.title ? ` - ${app.model.ui.title}` : '' }}
    </template>
    <template #append>
      <PlAgDataTableToolsPanel/>
      <PlBtnGhost @click.stop="() => (settingsOpen = true)">
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
    <PlSlideModal v-model="settingsOpen" :close-on-outside-click="true">
      <template #title>Settings</template>
      <PlDropdownRef
        v-model="app.model.args.aaSeqCDR3Ref"
        :options="app.model.outputs.cdr3Options"
        label="Select dataset"
        clearable
      />
      <PlDropdown
        v-model="app.model.args.abundanceRef"
        :options="app.model.outputs.abundanceOptions"
        label="Abundance"
        required
      />

      <PlNumberField
        v-model="app.model.args.identity"
        label="Minimal identity" :minValue="0.1" :step="0.1" :maxValue="1.0"
      >
        <template #tooltip>
          Select min identity of clonotypes in the cluster.
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
