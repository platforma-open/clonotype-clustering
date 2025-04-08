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
const chainOptions = computed(() => {
  const options: string[] = [];
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
  if (app.model.outputs.anchorSpecs) {
    if (app.model.outputs.anchorSpecs?.annotations?.['mixcr.com/cellTags'] === '') {
      app.model.args.dataType = 'bulk';
    } else {
      app.model.args.dataType = 'singleCell';
      app.model.args.chain = undefined;
    }
  } else {
    app.model.args.dataType = undefined;
    app.model.args.chain = undefined;
  }
});

const columns = ref<PTableColumnSpec[]>([]);
</script>

<template>
  {{ app.model.args.dataType }}
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
    <!-- Only allow chain selection in bulk datasets -->
    <template v-if="app.model.args.dataType === 'bulk'">
      <PlDropdown v-model="app.model.args.chain" :options="chainOptions" label="Define clustering chain" />
    </template>
  </PlSlideModal>
</template>
