<script setup lang="ts">
import { PlMultiSequenceAlignment } from "@milaboratories/multi-sequence-alignment";
import strings from "@milaboratories/strings";
import {
  clusteringToolOptions,
  similarityTypeOptions,
} from "@platforma-open/milaboratories.clonotype-clustering.model";
import type {
  AxisId,
  PColumnIdAndSpec,
  PlRef,
  PlSelectionModel,
  PTableKey,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
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
} from "@platforma-sdk/ui-vue";
import { computed, reactive, ref, watch } from "vue";
import { useApp } from "../app";

const app = useApp();

const multipleSequenceAlignmentOpen = ref(false);
const mmseqsLogOpen = ref(false);
const settingsOpen = ref(
  app.model.data.datasetRef === undefined || app.model.data.sequencesRef === undefined,
);

// Watch for when the workflow starts running and close settings
watch(
  () => app.model.outputs.isRunning,
  (isRunning) => {
    if (isRunning) {
      settingsOpen.value = false;
    }
  },
);
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
  app.model.data.datasetRef = inputRef;
  // Sequence selections are scoped to a dataset; switching datasets invalidates
  // them. Clear so the user re-picks against the new options and we never carry
  // over an unresolvable ref (which would crash the workflow at xsv import).
  app.model.data.sequencesRef = [];
}

// Self-heal stale sequence selections. PlDropdownMulti only renders chips for
// refs present in `:options`, so if the dataset/upstream changes and a
// previously-selected sequence column disappears from the options, the user
// can no longer deselect it — leaving the block stuck with an unresolvable ref
// that crashes the run ("Invalid column value in frame"). Whenever options
// load, drop any selected ref that is no longer a valid option.
// Guard: act only on a non-empty, loaded option set, so a transient
// loading/empty state can't wipe a valid selection. Watching the OUTPUT (not
// `data.sequencesRef`) is deliberate — see onSequencesRefChange's note about
// the SDK replacing the whole args object on server patches.
watch(
  () => app.model.outputs.sequenceOptions,
  (options) => {
    if (!options || options.length === 0) return;
    const selected = app.model.data.sequencesRef;
    if (!selected || selected.length === 0) return;
    const valid = new Set(options.map((o) => o.value));
    const pruned = selected.filter((id) => valid.has(id));
    if (pruned.length !== selected.length) {
      app.model.data.sequencesRef = pruned;
    }
  },
  { immediate: true },
);

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.clustersTable,
});

const sequenceType = listToOptions(["aminoacid", "nucleotide"]);

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
  const trimEnabled = (app.model.data.trimStart ?? 0) > 0 || (app.model.data.trimEnd ?? 0) > 0;
  if (trimEnabled) {
    // When trimming is enabled, use annotation to include only trimmed sequences
    return column.spec?.annotations?.["pl7.app/sequence/trimmed"] === "true";
  }
  // Default: only show the clustering sequence(s) selected by the user
  return app.model.data.sequencesRef?.some((r) => r === column.columnId) ?? false;
};

// Reset highPrecision when switching to linclust
watch(
  () => app.model.data.clusteringTool,
  (tool) => {
    if (tool === "easy-linclust") {
      app.model.data.highPrecision = false;
    }
  },
);

// Check if any selected sequence is CDR3
const hasCDR3Sequences = computed(() => {
  if (!app.model.data.sequencesRef || !app.model.outputs.sequenceOptions) {
    return false;
  }

  const sequenceOptions = app.model.outputs.sequenceOptions;
  return app.model.data.sequencesRef.some((selectedId) => {
    const option = sequenceOptions.find((opt) => opt.value === selectedId);
    if (!option) return false;

    // Check if the column name contains CDR3 (case insensitive)
    const columnName = option.label?.toLowerCase() || "";
    return columnName.includes("cdr3") || columnName.includes("cdr-3");
  });
});

// Auto-suggest BLOSUM matrix when the user changes selected sequences.
// Wired to the dropdown's @update:model-value — must NOT be a `watch` on
// args.sequencesRef, because the SDK replaces the entire `args` object on
// external-author server patches (see createAppV2.ts updateAppModel), giving
// every nested property a new reference. A watcher would fire on that
// replacement and clobber the user's explicit BLOSUM choice on app reopen
// or any concurrent write.
function onSequencesRefChange(sequencesRef: SUniversalPColumnId[]) {
  app.model.data.sequencesRef = sequencesRef;

  if (app.model.data.similarityType === "sequence-identity") return;

  const sequenceOptions = app.model.outputs.sequenceOptions;
  if (!sequencesRef?.length || !sequenceOptions) return;

  const allFramework = sequencesRef.every((selectedId) => {
    const option = sequenceOptions.find((opt) => opt.value === selectedId);
    if (!option) return false;
    const label = option.label?.toLowerCase() || "";
    return label.includes("fr") && !label.includes("cdr");
  });

  app.model.data.similarityType = allFramework ? "blosum80" : "blosum62";
}

// Set instructions to track cluster axis
const clusterAxis = computed<AxisId>(() => {
  if (app.model.outputs.clusterAbundanceSpec?.axesSpec[1] === undefined) {
    return {
      type: "String",
      name: "pl7.app/clusterId",
      domain: {},
    };
  } else {
    return {
      type: "String",
      name: "pl7.app/clusterId",
      domain: app.model.outputs.clusterAbundanceSpec?.axesSpec[1].domain,
    };
  }
});
</script>

<template>
  <PlBlockPage
    v-model:subtitle="app.model.data.customBlockLabel"
    :subtitle-placeholder="app.model.data.defaultBlockLabel"
    title="Sequence Clustering"
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
      v-model="app.model.data.tableState"
      :settings="tableSettings"
      :not-ready-text="strings.callToActions.configureSettingsAndRun"
      :no-rows-text="strings.states.noDataAvailable"
      :show-cell-button-for-axis-id="clusterAxis"
      @cell-button-clicked="onRowDoubleClicked"
    />
    <PlSlideModal v-model="settingsOpen" close-on-outside-click shadow>
      <template #title>{{ strings.titles.settings }}</template>
      <PlDropdownRef
        v-model="app.model.data.datasetRef"
        :options="app.model.outputs.datasetOptions"
        :label="strings.titles.dataset"
        clearable
        required
        @update:model-value="setInput"
      />
      <PlBtnGroup
        v-model="app.model.data.sequenceType"
        label="Sequence Type"
        :options="sequenceType"
        compact
      />
      <PlDropdownMulti
        :model-value="app.model.data.sequencesRef"
        :options="app.model.outputs.sequenceOptions"
        label="Sequence Columns to Cluster"
        required
        :disabled="app.model.data.datasetRef === undefined"
        @update:model-value="onSequencesRefChange"
      />

      <PlDropdown
        v-model="app.model.data.similarityType"
        :options="similarityTypeOptions"
        label="Alignment Score"
      >
        <template #tooltip>
          Select the similarity metric used for clustering. BLOSUM matrices score biochemical
          similarity between amino acids — lower numbers (e.g. BLOSUM40) tolerate more substitutions
          and suit more divergent sequences, higher numbers (e.g. BLOSUM80) penalize substitutions
          more strongly and suit highly conserved sequences such as antibody framework regions.
          BLOSUM62 is a balanced default and works well for CDRs and many peptide sets. For very
          short peptides (≤8 aa), Exact Match — which counts only identical residues — might be a
          safer choice.
        </template>
      </PlDropdown>

      <PlNumberField
        v-model="app.model.data.identity"
        label="Minimal Identity"
        :minValue="0.1"
        :step="0.1"
        :maxValue="1.0"
      >
        <template #tooltip>
          Sets the lowest percentage of identical residues required for sequences to be considered
          for the same cluster.
        </template>
      </PlNumberField>

      <PlNumberField
        v-model="app.model.data.coverageThreshold"
        label="Coverage Threshold"
        :minValue="0.1"
        :step="0.1"
        :maxValue="1.0"
      >
        <template #tooltip>
          Sets the lowest percentage of sequence length that must be covered for sequences to be
          considered for the same cluster.
        </template>
      </PlNumberField>

      <PlSectionSeparator>Centroid</PlSectionSeparator>
      <PlNumberField
        v-model="app.model.data.consensusThreshold"
        label="Consensus Threshold"
        :minValue="0"
        :step="0.05"
        :maxValue="1.0"
      >
        <template #tooltip>
          Minimum abundance-weighted fraction a residue must reach in an alignment column for the
          <b>Theoretical Centroid</b> to emit it; columns below the threshold emit <b>X</b>. The
          theoretical centroid (kalign MSA consensus) is what distance-to-centroid and cluster
          radius are measured against; the <b>Reference Centroid</b> (the closest real member) is
          always reported alongside it.
        </template>
      </PlNumberField>

      <PlCheckbox
        v-if="app.model.outputs.modality === 'peptide'"
        v-model="app.model.data.generateDataset"
      >
        Export consensus sequences as a dataset
        <PlTooltip class="info" position="top">
          <template #tooltip>
            Collapse each cluster into a single representative sequence and export them as a new
            dataset you can feed into downstream analyses. The representative is the cluster's
            <b>consensus</b> — the most frequent amino acid at each aligned position, weighted by
            clonotype abundance — so it summarizes the whole group and need not match any individual
            observed clonotype. Available for peptide inputs only.
          </template>
        </PlTooltip>
      </PlCheckbox>

      <PlAlert v-if="app.model.outputs.inputState" type="warn" style="margin-top: 1rem">
        {{
          "Error: The input dataset you have selected is empty. \
          Please choose a different dataset."
        }}
      </PlAlert>
      <PlAlert
        v-if="
          app.model.outputs.modality === 'peptide' &&
          app.model.outputs.minPeptideLength !== undefined &&
          app.model.outputs.minPeptideLength < 5
        "
        type="warn"
        style="margin-top: 1rem"
      >
        {{
          "Warning: Some peptides in the input are shorter than 5 amino acids. \
          MMseqs2 requires at least 5 aa for k-mer matching, so clustering results \
          for these peptides may be empty or incomplete."
        }}
      </PlAlert>

      <PlAccordionSection :label="strings.titles.advancedSettings">
        <PlDropdown
          v-model="app.model.data.clusteringTool"
          :options="clusteringToolOptions"
          label="Clustering Algorithm"
        >
          <template #tooltip>
            <b>Easy Cluster</b> — standard MMseqs2 cascaded clustering. Accurate for all dataset
            sizes.<br />
            <b>Easy Linclust</b> — linear-time clustering algorithm. Much faster for large datasets
            but may produce less precise clusters.
          </template>
        </PlDropdown>

        <PlCheckbox
          v-model="app.model.data.highPrecision"
          :disabled="app.model.data.clusteringTool === 'easy-linclust'"
        >
          High precision mode
          <PlTooltip class="info" position="top">
            <template #tooltip
              >Uses high-sensitivity MMseqs2 settings optimized for short sequences (e.g. a single
              CDR or a short peptide). Disable for longer sequences (e.g. full VDJ region or
              multiple concatenated sequences) as it may significantly increase computation time and
              memory usage. Only available with easy-cluster.</template
            >
          </PlTooltip>
        </PlCheckbox>

        <template v-if="hasCDR3Sequences">
          <PlSectionSeparator>Trimming options</PlSectionSeparator>
          <PlNumberField
            v-model="app.model.data.trimStart"
            label="Trim from start (amino acids)"
            :minValue="0"
            :step="1"
            :maxValue="100"
          >
            <template #tooltip>
              Number of amino acids to remove from the beginning of each CDR3 sequence before
              clustering.
            </template>
          </PlNumberField>

          <PlNumberField
            v-model="app.model.data.trimEnd"
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
          v-model="app.model.data.mem"
          label="Memory (GiB)"
          :minValue="1"
          :step="1"
          :maxValue="1012"
        >
          <template #tooltip> Sets the amount of memory to use for the clustering. </template>
        </PlNumberField>

        <PlNumberField
          v-model="app.model.data.cpu"
          label="CPU (cores)"
          :minValue="1"
          :step="1"
          :maxValue="128"
        >
          <template #tooltip> Sets the number of CPU cores to use for the clustering. </template>
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
      v-model="app.model.data.alignmentModel"
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
