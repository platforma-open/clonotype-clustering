<script setup lang="ts">
import type { AxisId, PColumnIdAndSpec, PlRef, PlSelectionModel, PTableKey } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import {
  listToOptions,
  PlAccordionSection,
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlBtnGroup,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlMaskIcon24,
  PlMultiSequenceAlignment,
  PlNumberField,
  PlSlideModal,
  usePlDataTableSettingsV2,
} from '@platforma-sdk/ui-vue';
import { computed, reactive, ref } from 'vue';
import { useApp } from '../app';

const app = useApp();
const multipleSequenceAlignmentOpen = ref(false);

const settingsOpen = ref(app.model.args.datasetRef === undefined || app.model.args.sequencesRef === undefined);
// With selection we will get the axis of cluster id
const selection = ref<PlSelectionModel>({
  axesSpec: [],
  selectedKeys: [],
});

// Open MSA when we click in a row
const onRowDoubleClicked = reactive((key?: PTableKey) => {
  // Using keys (that will contain cluster ID) we get included clonotypes
  if (key) {
    const clusterSpecs = app.model.outputs.clusterAbundanceSpec;
    if (clusterSpecs === undefined) return;
    selection.value = {
      axesSpec: [clusterSpecs.axesSpec[1]],
      selectedKeys: [key],
    };
  }
  multipleSequenceAlignmentOpen.value = true;
});

function setInput(inputRef?: PlRef) {
  app.model.args.datasetRef = inputRef;
  if (inputRef) {
    const datasetLabel = app.model.outputs.datasetOptions?.find((o) => plRefsEqual(o.ref, inputRef))?.label;
    if (datasetLabel)
      app.model.ui.title = 'Clonotype Clustering - ' + datasetLabel;
  }
}

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.clustersTable,
});

const tableLoadingText = computed(() => {
  if (app.model.outputs.isRunning) {
    return 'Running';
  }
  return 'Loading';
});

const sequenceType = listToOptions(['aminoacid', 'nucleotide']);

// Map user-facing similarity type to mmseqs2 similarity type
const similarityTypeOptions = [
  { label: 'Exact Match', value: 'sequence-identity' },
  { label: 'BLOSUM', value: 'alignment-score' },
];

// No longer available to user
/* const coverageModeOptions = [
  { label: 'Coverage of query and target', value: 0 },
  { label: 'Coverage of target', value: 1 },
  { label: 'Coverage of query', value: 2 },
  { label: 'Target length ≥ x% of query length', value: 3 },
  { label: 'Query length ≥ x% of target length', value: 4 },
  { label: 'Shorter sequence ≥ x% of longer', value: 5 },
]; */

const isSequenceColumn = (column: PColumnIdAndSpec) => {
  return app.model.args.sequencesRef?.some((r) => r === column.columnId);
};

const isLinkerColumn = (column: PColumnIdAndSpec) => {
  return column.columnId === app.model.outputs.linkerColumnId;
};

// Set instructions to track cluster axis
const clusterAxis = computed<AxisId>(() => {
  if (app.model.outputs.clusterAbundanceSpec?.axesSpec[1] === undefined) {
    return {
      type: 'String',
      name: 'pl7.app/vdj/clusterId',
      domain: {},
    };
  } else {
    return {
      type: 'String',
      name: 'pl7.app/vdj/clusterId',
      domain: app.model.outputs.clusterAbundanceSpec?.axesSpec[1].domain,
    };
  }
});

</script>

<template>
  <PlBlockPage>
    <template #title>
      {{ app.model.ui.title }}
    </template>
    <template #append>
      <PlBtnGhost @click.stop="() => (settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <PlAgDataTableV2
      v-if="app.model.outputs.inputState === false"
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      :loading-text="tableLoadingText"
      not-ready-text="Data is not computed"
      :show-cell-button-for-axis-id="clusterAxis"
      @cell-button-clicked="onRowDoubleClicked"
    />
    <PlSlideModal v-model="settingsOpen" :close-on-outside-click="true">
      <template #title>Settings</template>
      <PlDropdownRef
        v-model="app.model.args.datasetRef"
        :options="app.model.outputs.datasetOptions"
        label="Select dataset"
        clearable
        required
        @update:model-value="setInput"
      />
      <PlBtnGroup
        v-model="app.model.args.sequenceType"
        label="Sequence type"
        :options="sequenceType"
        :compact="true"
      />
      <PlDropdownMulti
        v-model="app.model.args.sequencesRef"
        :options="app.model.outputs.sequenceOptions"
        label="Select sequence column/s to cluster"
        required
      />

      <PlDropdown
        v-model="app.model.args.similarityType"
        :options="similarityTypeOptions"
        label="Alignment Score"
      >
        <template #tooltip>
          Select the similarity metric used for clustering thresholds. BLOSUM considers biochemical similarity while Exact Match counts only identical residues.
        </template>
      </PlDropdown>

      <PlNumberField
        v-model="app.model.args.identity"
        label="Minimal identity" :minValue="0.1" :step="0.1" :maxValue="1.0"
      >
        <template #tooltip>
          Sets the lowest percentage of identical residues required for clonotypes to be considered for the same cluster.
        </template>
      </PlNumberField>

      <PlNumberField
        v-model="app.model.args.coverageThreshold"
        label="Coverage Threshold"
        :minValue="0.1"
        :step="0.1"
        :maxValue="1.0"
      >
        <template #tooltip>
          Sets the lowest percentage of sequence length that must be covered for clonotypes to be considered for the same cluster.
        </template>
      </PlNumberField>
      <PlAlert v-if="app.model.outputs.inputState" type="warn" style="margin-top: 1rem;">
        {{ "Error: The input dataset you have selected is empty. \
        Please choose a different dataset." }}
      </PlAlert>

      <PlAccordionSection label="Advanced Settings">
        <PlNumberField
          v-model="app.model.args.mem"
          label="Memory (GiB)"
          :minValue="1"
          :step="1"
          :maxValue="1012"
        >
          <template #tooltip>
            Sets the amount of memory to use for the clustering.
          </template>
        </PlNumberField>

        <PlNumberField
          v-model="app.model.args.cpu"
          label="CPU (cores)"
          :minValue="1"
          :step="1"
          :maxValue="128"
        >
          <template #tooltip>
            Sets the number of CPU cores to use for the clustering.
          </template>
        </PlNumberField>
      </PlAccordionSection>
    </PlSlideModal>
  </PlBlockPage>
  <!-- Slide window with MSA -->
  <PlSlideModal v-model="multipleSequenceAlignmentOpen" width="100%">
    <template #title>Multiple Sequence Alignment</template>
    <PlMultiSequenceAlignment
      v-if="app.model.outputs.inputState === false"
      v-model="app.model.ui.alignmentModel"
      :sequence-column-predicate="isSequenceColumn"
      :linker-column-predicate="isLinkerColumn"
      :p-frame="app.model.outputs.msaPf"
      :selection="selection"
    />
  </PlSlideModal>
</template>
