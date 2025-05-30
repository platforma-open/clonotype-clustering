<script setup lang="ts">
import type { AxisId, PColumnIdAndSpec, PlRef, PlSelectionModel, PTableKey } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import type {
  PlAgDataTableSettings,
} from '@platforma-sdk/ui-vue';
import {
  listToOptions,
  PlAccordionSection,
  PlAgDataTableToolsPanel,
  PlAgDataTableV2,
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

const tableSettings = computed<PlAgDataTableSettings>(() => {
  const pTable = app.model.outputs.clustersTable;

  if (pTable === undefined && !app.model.outputs.isRunning) {
    // special case: when block is not yet started at all (no table calculated)
    return undefined;
  }

  return {
    sourceType: 'ptable',
    model: pTable,
  };
});

const tableLoadingText = computed(() => {
  if (app.model.outputs.isRunning) {
    return 'Running';
  }
  return 'Loading';
});

const sequenceType = listToOptions(['aminoacid', 'nucleotide']);

const similarityTypeOptions = [
  { label: 'Alignment Score', value: 'alignment-score' },
  { label: 'Sequence Identity', value: 'sequence-identity' },
];

const coverageModeOptions = [
  { label: 'Coverage of query and target', value: 0 },
  { label: 'Coverage of target', value: 1 },
  { label: 'Coverage of query', value: 2 },
  { label: 'Target length ≥ x% of query length', value: 3 },
  { label: 'Query length ≥ x% of target length', value: 4 },
  { label: 'Shorter sequence ≥ x% of longer', value: 5 },
];

const isSequenceColumn = (column: PColumnIdAndSpec) => {
  return app.model.args.sequencesRef?.some((r) => r === column.columnId);
};

const isLinkerColumn = (column: PColumnIdAndSpec) => {
  return column.columnId === app.model.outputs.linkerColumnId;
};

const isLabelColumnOption = (_column: PColumnIdAndSpec) => {
  return true;
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
      <PlAgDataTableToolsPanel/>
      <PlBtnGhost @click.stop="() => (settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <PlAgDataTableV2
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      :loading-text="tableLoadingText"
      not-ready-text="Block is not started"
      show-columns-panel
      show-export-button
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

      <PlNumberField
        v-model="app.model.args.identity"
        label="Minimal identity" :minValue="0.1" :step="0.1" :maxValue="1.0"
      >
        <template #tooltip>
          Select min identity of clonotypes in the cluster.
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
          Select min fraction of aligned (covered) residues of clonotypes in the cluster.
        </template>
      </PlNumberField>

      <PlAccordionSection label="Advanced Settings">
        <PlDropdown
          v-model="app.model.args.similarityType"
          :options="similarityTypeOptions"
          label="Similarity Type"
        >
          <template #tooltip>
            Type of similarity score used for clustering.
          </template>
        </PlDropdown>

        <PlDropdown
          v-model="app.model.args.coverageMode"
          :options="coverageModeOptions"
          label="Coverage Mode"
        >
          <template #tooltip>
            How to calculate the coverage between sequences for the coverage threshold.
          </template>
        </PlDropdown>
      </PlAccordionSection>
    </PlSlideModal>
  </PlBlockPage>
  <!-- Slide window with results -->
  <PlSlideModal v-model="multipleSequenceAlignmentOpen" width="100%">
    <template #title>Multiple Sequence Alignment</template>
    <PlMultiSequenceAlignment
      v-model="app.model.ui.alignmentModel"
      :label-column-option-predicate="isLabelColumnOption"
      :sequence-column-predicate="isSequenceColumn"
      :linker-column-predicate="isLinkerColumn"
      :p-frame="app.model.outputs.msaPf"
      :selection="selection"
    />
  </PlSlideModal>
</template>
