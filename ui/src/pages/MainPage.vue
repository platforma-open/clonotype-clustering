<script setup lang="ts">
import { plRefsEqual, type PlRef } from '@platforma-sdk/model';
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

function setInput(inputRef?: PlRef) {
  app.model.args.aaSeqCDR3Ref = inputRef;
  if (inputRef) {
    const datasetLabel = app.model.outputs.cdr3Options?.find((o) => plRefsEqual(o.ref, inputRef))?.label;
    if (datasetLabel)
      app.model.ui.title = 'Clonotype Clustering - ' + datasetLabel;
  }
}

const tableSettings = computed<PlDataTableSettings | undefined>(() => {
  const pTable = app.model.outputs.clustersTable;
  if (pTable === undefined) {
    // when table is not yet calculated
    if (app.model.outputs.isRunning) {
      // @TODO: proper "running" message
      return undefined;
    } else {
      // @TODO: proper "not calculated" message
      return undefined;
    }
  }
  return {
    sourceType: 'ptable',
    pTable: app.model.outputs.clustersTable,
  };
});

</script>

<template>
  <PlBlockPage>
    <template #title>
      {{ app.model.ui.title }}
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
        @update:model-value="setInput"
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
