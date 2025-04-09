<script setup lang="ts">
import type {
  PlDataTableSettings } from '@platforma-sdk/ui-vue';
import { PlBlockPage,
  PlAgDataTableToolsPanel,
  PlBtnGhost,
  PlAgDataTable,
  PlMaskIcon24,
  PlSlideModal,
  PlDropdownRef,
  PlDropdown,
  listToOptions } from '@platforma-sdk/ui-vue';
import type { PlRef, PTableColumnSpec } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import { useApp } from '../app';
import { computed, ref, watch } from 'vue';

const app = useApp();

function setAnchorColumn(ref: PlRef | undefined) {
  app.model.args.inputAnchor = ref;
  app.model.args.clonotypingRunId = ref?.blockId;
  app.model.ui.title = ref
    ? app.model.outputs.inputOptions?.find((o) =>
      plRefsEqual(o.ref, ref),
    )?.label
    : undefined;
}

// Generate list of all available Ig chains
// @TODO: convert names to light or heavy
const chainOptions = computed(() => {
  const options: string[] = [];
  // Chain selection will only be available in cases in which
  // by default we want to select both chains in most cases
  options.push('Both chains');

  // Get individual chain list
  if (app.model.outputs.chainOptions !== undefined) {
    for (const obj of app.model.outputs.chainOptions) {
      options.push(obj.label);
    }
  }

  return listToOptions(options);
});

const tableSettings = computed<PlDataTableSettings | undefined>(() =>
  app.model.args.inputAnchor
    ? {
        sourceType: 'ptable',
        pTable: app.model.outputs.table,
      }
    : undefined,
);

// If input dataset changes we check again if data is bulk or single cell
watch(() => app.model.outputs.anchorSpecs, (_) => {
  if (!app.model.outputs.anchorSpecs) {
    app.model.args.dataType = undefined;
    app.model.args.chain = undefined;
  } else {
    if (app.model.outputs.anchorSpecs?.annotations?.['pl7.app/abundance/unit'] === 'molecules') {
      app.model.args.dataType = 'bulk';
      app.model.args.chain = app.model.outputs.anchorSpecs?.domain?.['pl7.app/vdj/chain'];
    } else if (app.model.outputs.anchorSpecs?.annotations?.['pl7.app/abundance/unit'] === 'cells') {
      app.model.args.dataType = 'singleCell';
      app.model.args.chain = 'Both chains';
      // in scFv we work as in single-cell
    } else if (app.model.outputs.anchorSpecs?.annotations?.['pl7.app/abundance/unit'] === 'reads') {
      app.model.args.dataType = 'scFv';
      app.model.args.chain = 'Both chains';
    } else {
      app.model.args.dataType = undefined;
      app.model.args.chain = undefined;
    }
  }
});

const columns = ref<PTableColumnSpec[]>([]);
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
    <div style="flex: 1">
      <PlAgDataTable
        ref="tableInstance"
        v-model="app.model.ui.tableState"
        :settings="tableSettings"
        show-columns-panel
        show-export-button
        @columns-changed="(newColumns) => (columns = newColumns)"
      />
    </div>
  </PlBlockPage>
  <PlSlideModal v-model="app.model.ui.settingsOpen" :close-on-outside-click="true">
    <template #title>Settings</template>
    <PlDropdownRef
      :options="app.model.outputs.inputOptions"
      :model-value="app.model.args.inputAnchor"
      label="Select dataset"
      clearable
      @update:model-value="setAnchorColumn"
    />
    <!-- Bulk datasets are splitted by chain, only allow selection in single-cell -->
    <template v-if="['singleCell', 'scFv'].includes(app.model.args.dataType ?? '')">
      <PlDropdown v-model="app.model.args.chain" :options="chainOptions" label="Define clustering chain" />
    </template>
  </PlSlideModal>
</template>
