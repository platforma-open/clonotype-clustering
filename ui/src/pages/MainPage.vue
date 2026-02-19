<script setup lang="ts">
import { PlMultiSequenceAlignment } from '@milaboratories/multi-sequence-alignment';
import strings from '@milaboratories/strings';
import { similarityTypeOptions } from '@platforma-open/milaboratories.clonotype-clustering.model';
import type { AxisId, PColumnIdAndSpec, PlRef, PlSelectionModel, PTableKey } from '@platforma-sdk/model';
import {
  listToOptions,
  PlAccordionSection,
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlBtnGroup,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlLogView,
  PlMaskIcon24,
  PlNumberField,
  PlSectionSeparator,
  PlSlideModal,
  PlTooltip,
  usePlDataTableSettingsV2,
} from '@platforma-sdk/ui-vue';
import { computed, reactive, ref, watch } from 'vue';
import { useApp } from '../app';

const app = useApp();
const multipleSequenceAlignmentOpen = ref(false);
const mmseqsLogOpen = ref(false);
const settingsOpen = ref(app.model.args.datasetRef === undefined || app.model.args.sequencesRef === undefined);

// Watch for when the workflow starts running and close settings
watch(() => app.model.outputs.isRunning, (isRunning) => {
  if (isRunning) {
    settingsOpen.value = false;
  }
});
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
}

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.clustersTable,
});

const sequenceType = listToOptions(['aminoacid', 'nucleotide']);

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
  const trimEnabled = ((app.model.args.trimStart ?? 0) > 0) || ((app.model.args.trimEnd ?? 0) > 0);
  if (trimEnabled) {
    // When trimming is enabled, use annotation to include only trimmed sequences
    return column.spec?.annotations?.['pl7.app/sequence/trimmed'] === 'true';
  }
  // Default: only show the clustering sequence(s) selected by the user
  return app.model.args.sequencesRef?.some((r) => r === column.columnId) ?? false;
};

// Check if only single CDR sequence is selected (cdr1, cdr2, or cdr3)
const isSingleCdrSelected = computed(() => {
  const refs = app.model.args.sequencesRef;
  const options = app.model.outputs.sequenceOptions;
  if (!refs || !options || refs.length !== 1) return false;

  const option = options.find((opt) => opt.value === refs[0]);
  if (!option) return false;

  const label = option.label?.toLowerCase() || '';
  return label.includes('cdr1') || label.includes('cdr2') || label.includes('cdr3')
    || label.includes('cdr-1') || label.includes('cdr-2') || label.includes('cdr-3');
});

// Auto-set highPrecision default when sequence selection changes
watch(() => app.model.args.sequencesRef, () => {
  app.model.args.highPrecision = isSingleCdrSelected.value;
});

// Check if any selected sequence is CDR3
const hasCDR3Sequences = computed(() => {
  if (!app.model.args.sequencesRef || !app.model.outputs.sequenceOptions) {
    return false;
  }

  const sequenceOptions = app.model.outputs.sequenceOptions;
  return app.model.args.sequencesRef.some((selectedId) => {
    const option = sequenceOptions.find((opt) => opt.value === selectedId);
    if (!option) return false;

    // Check if the column name contains CDR3 (case insensitive)
    const columnName = option.label?.toLowerCase() || '';
    return columnName.includes('cdr3') || columnName.includes('cdr-3');
  });
});

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
  <PlBlockPage
    v-model:subtitle="app.model.args.customBlockLabel"
    :subtitle-placeholder="app.model.args.defaultBlockLabel"
    title="Clonotype Clustering"
  >
    <template #append>
      <PlBtnGhost @click.stop="() => (mmseqsLogOpen = true)">
        {{ strings.titles.logs }}
        <template #append>
          <PlMaskIcon24 name="file-logs" />
        </template>
      </PlBtnGhost>
      <PlBtnGhost @click.stop="() => (settingsOpen = true)">
        {{ strings.titles.settings }}
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <PlAgDataTableV2
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      :not-ready-text="strings.callToActions.configureSettingsAndRun"
      :no-rows-text="strings.states.noDataAvailable"
      :show-cell-button-for-axis-id="clusterAxis"
      @cell-button-clicked="onRowDoubleClicked"
    />
    <PlSlideModal v-model="settingsOpen" close-on-outside-click shadow>
      <template #title>{{ strings.titles.settings }}</template>
      <PlDropdownRef
        v-model="app.model.args.datasetRef"
        :options="app.model.outputs.datasetOptions"
        :label="strings.titles.dataset"
        clearable
        required
        @update:model-value="setInput"
      />
      <PlBtnGroup
        v-model="app.model.args.sequenceType"
        label="Sequence Type"
        :options="sequenceType"
        compact
      />
      <PlDropdownMulti
        v-model="app.model.args.sequencesRef"
        :options="app.model.outputs.sequenceOptions"
        label="Sequence Columns to Cluster"
        required
        :disabled="app.model.args.datasetRef === undefined"
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
        label="Minimal Identity"
        :minValue="0.1"
        :step="0.1"
        :maxValue="1.0"
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
      <PlAlert v-if="app.model.outputs.inputState" type="warn" style="margin-top: 1rem">
        {{
          'Error: The input dataset you have selected is empty. \
          Please choose a different dataset.'
        }}
      </PlAlert>

      <PlAccordionSection :label="strings.titles.advancedSettings">
        <PlCheckbox v-model="app.model.args.highPrecision">
          High precision mode
          <PlTooltip class="info" position="top">
            <template #tooltip>Uses high-sensitivity MMseqs2 settings optimized for short sequences (e.g. single CDR). Disable for longer sequences (e.g. full VDJ region or multiple sequences) as it may significantly increase computation time.</template>
          </PlTooltip>
        </PlCheckbox>

        <template v-if="hasCDR3Sequences">
          <PlSectionSeparator>Trimming options</PlSectionSeparator>
          <PlNumberField
            v-model="app.model.args.trimStart"
            label="Trim from start (amino acids)"
            :minValue="0"
            :step="1"
            :maxValue="100"
          >
            <template #tooltip>
              Number of amino acids to remove from the beginning of each CDR3 sequence before clustering.
            </template>
          </PlNumberField>

          <PlNumberField
            v-model="app.model.args.trimEnd"
            label="Trim from end (amino acids)"
            :minValue="0"
            :step="1"
            :maxValue="100"
          >
            <template #tooltip>
              Number of amino acids to remove from the end of each CDR3 sequence before clustering.
            </template>
          </PlNumberField>
        </template>

        <PlSectionSeparator>Resource Allocation</PlSectionSeparator>
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
  <PlSlideModal
    v-model="multipleSequenceAlignmentOpen"
    width="100%"
    :close-on-outside-click="false"
  >
    <template #title>{{ strings.titles.multipleSequenceAlignment }}</template>
    <PlMultiSequenceAlignment
      v-if="app.model.outputs.inputState === false"
      v-model="app.model.ui.alignmentModel"
      :sequence-column-predicate="isSequenceColumn"
      :p-frame="app.model.outputs.msaPf"
      :selection="selection"
    />
  </PlSlideModal>
  <!-- Slide window with MMseqs2 log -->
  <PlSlideModal v-model="mmseqsLogOpen" width="80%">
    <template #title>MMseqs2 Log</template>
    <PlLogView :log-handle="app.model.outputs.mmseqsOutput" />
  </PlSlideModal>
</template>
