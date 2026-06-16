<script setup lang="ts">
import { PlMultiSequenceAlignment } from '@milaboratories/multi-sequence-alignment';
import strings from '@milaboratories/strings';
import { clusteringToolOptions, similarityTypeOptions } from '@platforma-open/milaboratories.clonotype-clustering.model';
import type { AxisId, PColumnIdAndSpec, PlRef, PlSelectionModel, PTableKey, SUniversalPColumnId } from '@platforma-sdk/model';
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
const settingsOpen = ref(app.model.data.datasetRef === undefined || app.model.data.sequencesRef === undefined);

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
  app.model.data.datasetRef = inputRef;
  // Embedding refs are anchor-bound and not portable across datasets: reset to sequence mode and
  // clear the embedding selection on any dataset change.
  app.model.data.clusteringMethod = 'sequence';
  app.model.data.embeddingRef = undefined;
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
  const trimEnabled = ((app.model.data.trimStart ?? 0) > 0) || ((app.model.data.trimEnd ?? 0) > 0);
  if (trimEnabled) {
    // When trimming is enabled, use annotation to include only trimmed sequences
    return column.spec?.annotations?.['pl7.app/sequence/trimmed'] === 'true';
  }
  // Default: only show the clustering sequence(s) selected by the user
  return app.model.data.sequencesRef?.some((r) => r === column.columnId) ?? false;
};

// Reset highPrecision when switching to linclust
watch(() => app.model.data.clusteringTool, (tool) => {
  if (tool === 'easy-linclust') {
    app.model.data.highPrecision = false;
  }
});

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
    const columnName = option.label?.toLowerCase() || '';
    return columnName.includes('cdr3') || columnName.includes('cdr-3');
  });
});

// --- Embedding-distance clustering ---
const clusteringMethodOptions = [
  { label: 'Sequences', value: 'sequence' },
  { label: 'Embeddings', value: 'embedding' },
] as const;

// Embedding mode is reachable only when an embedding column is discoverable on the dataset.
const embeddingAvailable = computed(() => (app.model.outputs.embeddingOptions?.length ?? 0) > 0);
// Effective mode: fall back to sequence rendering if embeddings aren't available, even if the stored
// method is 'embedding' (e.g. embeddings vanished without a dataset change).
const effectiveMethod = computed(() =>
  (app.model.data.clusteringMethod === 'embedding' && embeddingAvailable.value) ? 'embedding' : 'sequence',
);

// Safeguard: if the embedding column's producer becomes undiscoverable while embedding mode is stored
// (e.g. the upstream Sequence Embeddings block is removed without a dataset change), fall back to
// sequence mode so the args projection and the UI agree.
watch(embeddingAvailable, (available) => {
  if (!available && app.model.data.clusteringMethod === 'embedding') {
    app.model.data.clusteringMethod = 'sequence';
    app.model.data.embeddingRef = undefined;
  }
});

// Auto-derive the source sequence column(s) for the picked embedding column, so the user need
// not pick a sequence column in embedding mode.
function deriveSourceSeqRefs(embeddingRef: PlRef): SUniversalPColumnId[] {
  const embOpts = app.model.outputs.embeddingOptions;
  const seqOpts = app.model.outputs.sequenceOptions;
  if (!embOpts || !seqOpts) return [];
  const embFeature = embOpts.find(
    (o) => o.ref.blockId === embeddingRef.blockId && o.ref.name === embeddingRef.name,
  )?.feature;
  if (!embFeature) return [];
  const domainOf = (id: string): Record<string, string> => {
    try {
      return (JSON.parse(id)?.domain ?? {}) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const nameOf = (id: string): string | undefined => {
    try {
      return JSON.parse(id)?.name as string | undefined;
    } catch {
      return undefined;
    }
  };
  const norm = (f: string | undefined) => (f ?? '').replace(/InFrame$/i, '');
  // Source sequences are amino acid (ESM-2). Embedding mode forces sequenceType='aminoacid', but guard
  // explicitly so a stale nucleotide selection yields no match rather than a wrong (nucleotide) one.
  const isAa = (id: string) => domainOf(id)['pl7.app/alphabet'] === 'aminoacid';
  const seqFeature = (id: string) => {
    const d = domainOf(id);
    return d['pl7.app/vdj/feature'] ?? d['pl7.app/feature'];
  };
  // Fv = VH+VL VDJRegion concatenation -> both chains' VDJRegion source columns.
  if (embFeature === 'Fv') {
    return seqOpts.filter((o) => isAa(o.value) && norm(seqFeature(o.value)) === 'VDJRegion').map((o) => o.value);
  }
  // scFv = the single-construct sequence column.
  if (embFeature === 'scFv') {
    return seqOpts.filter((o) => isAa(o.value) && nameOf(o.value) === 'pl7.app/vdj/scFv-sequence').map((o) => o.value);
  }
  // CDR3 / VDJRegion / peptide: match on the InFrame-normalized feature.
  const target = norm(embFeature);
  return seqOpts.filter((o) => isAa(o.value) && norm(seqFeature(o.value)) === target).map((o) => o.value);
}

// Method toggle gesture (V3 gesture-driven write, NOT a watcher). ESM-2 embeddings are amino-acid
// based, so embedding mode forces sequenceType='aminoacid'
function onMethodChange(method: 'sequence' | 'embedding') {
  app.model.data.clusteringMethod = method;
  if (method === 'embedding') app.model.data.sequenceType = 'aminoacid';
}

// On embedding-column pick: store the ref and auto-derive the source sequence column(s) for the
// centroid/MSA display.
function onEmbeddingRefChange(ref?: PlRef) {
  app.model.data.embeddingRef = ref;
  app.model.data.sequencesRef = ref ? deriveSourceSeqRefs(ref) : [];
}

// Auto-suggest BLOSUM matrix when the user changes selected sequences.
// Wired to the dropdown's @update:model-value — must NOT be a `watch` on
// args.sequencesRef, because the SDK replaces the entire `args` object on
// external-author server patches (see createAppV2.ts updateAppModel), giving
// every nested property a new reference. A watcher would fire on that
// replacement and clobber the user's explicit BLOSUM choice on app reopen
// or any concurrent write.
function onSequencesRefChange(sequencesRef: SUniversalPColumnId[]) {
  app.model.data.sequencesRef = sequencesRef;

  if (app.model.data.similarityType === 'sequence-identity') return;

  const sequenceOptions = app.model.outputs.sequenceOptions;
  if (!sequencesRef?.length || !sequenceOptions) return;

  const allFramework = sequencesRef.every((selectedId) => {
    const option = sequenceOptions.find((opt) => opt.value === selectedId);
    if (!option) return false;
    const label = option.label?.toLowerCase() || '';
    return label.includes('fr') && !label.includes('cdr');
  });

  app.model.data.similarityType = allFramework ? 'blosum80' : 'blosum62';
}

// Set instructions to track cluster axis
const clusterAxis = computed<AxisId>(() => {
  if (app.model.outputs.clusterAbundanceSpec?.axesSpec[1] === undefined) {
    return {
      type: 'String',
      name: 'pl7.app/clusterId',
      domain: {},
    };
  } else {
    return {
      type: 'String',
      name: 'pl7.app/clusterId',
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
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <PlBtnGroup
          v-if="embeddingAvailable"
          :model-value="app.model.data.clusteringMethod"
          label="Clustering mode"
          :options="clusteringMethodOptions"
          compact
          @update:model-value="onMethodChange"
        />
        <PlBtnGroup
          v-if="effectiveMethod === 'sequence'"
          v-model="app.model.data.sequenceType"
          label="Sequence Type"
          :options="sequenceType"
          compact
        />
      </div>
      <PlDropdownMulti
        v-if="effectiveMethod === 'sequence'"
        :model-value="app.model.data.sequencesRef"
        :options="app.model.outputs.sequenceOptions"
        label="Sequence Columns to Cluster"
        required
        :disabled="app.model.data.datasetRef === undefined"
        @update:model-value="onSequencesRefChange"
      />

      <template v-if="effectiveMethod === 'embedding'">
        <PlDropdownRef
          :model-value="app.model.data.embeddingRef"
          :options="app.model.outputs.embeddingOptions"
          label="Embedding Column to Cluster"
          required
          :disabled="app.model.data.datasetRef === undefined"
          @update:model-value="onEmbeddingRefChange"
        />
      </template>

      <template v-if="effectiveMethod === 'sequence'">
        <PlDropdown
          v-model="app.model.data.similarityType"
          :options="similarityTypeOptions"
          label="Alignment Score"
        >
          <template #tooltip>
            Select the similarity metric used for clustering. BLOSUM matrices score biochemical similarity between amino acids — lower numbers (e.g. BLOSUM40) tolerate more substitutions and suit more divergent sequences, higher numbers (e.g. BLOSUM80) penalize substitutions more strongly and suit highly conserved sequences such as antibody framework regions. BLOSUM62 is a balanced default and works well for CDRs and many peptide sets. For very short peptides (≤8 aa), Exact Match — which counts only identical residues — might be a safer choice.
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
            Sets the lowest percentage of identical residues required for sequences to be considered for the same cluster.
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
            Sets the lowest percentage of sequence length that must be covered for sequences to be considered for the same cluster.
          </template>
        </PlNumberField>
      </template>
      <PlAlert v-if="app.model.outputs.inputState" type="warn" style="margin-top: 1rem">
        {{
          'Error: The input dataset you have selected is empty. \
          Please choose a different dataset.'
        }}
      </PlAlert>
      <PlAlert
        v-if="effectiveMethod === 'sequence'
          && app.model.outputs.modality === 'peptide'
          && app.model.outputs.minPeptideLength !== undefined
          && app.model.outputs.minPeptideLength < 5"
        type="warn"
        style="margin-top: 1rem"
      >
        {{
          'Warning: Some peptides in the input are shorter than 5 amino acids. \
          MMseqs2 requires at least 5 aa for k-mer matching, so clustering results \
          for these peptides may be empty or incomplete.'
        }}
      </PlAlert>

      <PlAccordionSection :label="strings.titles.advancedSettings">
        <template v-if="effectiveMethod === 'embedding'">
          <PlNumberField
            v-model="app.model.data.minClusterSize"
            label="Min cluster size"
            :minValue="2"
            :step="1"
          >
            <template #tooltip>
              HDBSCAN minimum cluster size — the smallest group of clonotypes that forms a cluster. Smaller finds more, smaller clusters. Default 5.
            </template>
          </PlNumberField>
        </template>
        <template v-if="effectiveMethod === 'sequence'">
          <PlDropdown
            v-model="app.model.data.clusteringTool"
            :options="clusteringToolOptions"
            label="Clustering Algorithm"
          >
            <template #tooltip>
              <b>Easy Cluster</b> — standard MMseqs2 cascaded clustering. Accurate for all dataset sizes.<br/>
              <b>Easy Linclust</b> — linear-time clustering algorithm. Much faster for large datasets but may produce less precise clusters.
            </template>
          </PlDropdown>

          <PlCheckbox v-model="app.model.data.highPrecision" :disabled="app.model.data.clusteringTool === 'easy-linclust'">
            High precision mode
            <PlTooltip class="info" position="top">
              <template #tooltip>Uses high-sensitivity MMseqs2 settings optimized for short sequences (e.g. a single CDR or a short peptide). Disable for longer sequences (e.g. full VDJ region or multiple concatenated sequences) as it may significantly increase computation time and memory usage. Only available with easy-cluster.</template>
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
                Number of amino acids to remove from the beginning of each CDR3 sequence before clustering.
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
        </template>

        <PlSectionSeparator>Resource Allocation</PlSectionSeparator>
        <PlNumberField
          v-model="app.model.data.mem"
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
          v-model="app.model.data.cpu"
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
      v-model="app.model.data.alignmentModel"
      :sequence-column-predicate="isSequenceColumn"
      :p-frame="app.model.outputs.msaPf"
      :selection="selection"
    />
  </PlSlideModal>
  <!-- Slide window with MMseqs2 log -->
  <PlSlideModal v-model="mmseqsLogOpen" width="80%">
    <template #title>{{ app.model.data.clusteringMethod === 'embedding' ? 'Clustering Log' : 'MMseqs2 Log' }}</template>
    <PlLogView :log-handle="app.model.outputs.mmseqsOutput" />
  </PlSlideModal>
</template>
