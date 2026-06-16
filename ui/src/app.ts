import { getDefaultBlockLabel, platforma } from '@platforma-open/milaboratories.clonotype-clustering.model';
import { defineAppV3 } from '@platforma-sdk/ui-vue';
import { watchEffect } from 'vue';
import BubblePlotPage from './pages/BubblePlotPage.vue';
import MainPage from './pages/MainPage.vue';
import HistogramPage from './pages/HistogramPage.vue';

export const sdkPlugin = defineAppV3(platforma, (app) => {
  app.model.data.customBlockLabel ??= '';

  syncDefaultBlockLabel(app.model);

  return {
    progress: () => {
      return app.model.outputs.isRunning;
    },
    routes: {
      '/': () => MainPage,
      '/bubble': () => BubblePlotPage,
      '/histogram': () => HistogramPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;

type AppModel = ReturnType<typeof useApp>['model'];

function syncDefaultBlockLabel(model: AppModel) {
  // Resolve the human-readable column labels from the result pool (which the pure formatter can't do) and
  // hand them to getDefaultBlockLabel, which owns all label-format logic. The method branch here is only
  // about WHICH inputs to gather; it must run in the reactive effect (not only on the picker gesture)
  // because the embedding-mode auto-derive writes sequencesRef, which would otherwise re-trigger this
  // effect and recompute a sequence-mode label.
  watchEffect(() => {
    if (model.data.clusteringMethod === 'embedding') {
      const ref = model.data.embeddingRef;
      const embeddingLabel = ref
        ? model.outputs.embeddingOptions
          ?.find((o) => o.ref.blockId === ref.blockId && o.ref.name === ref.name)
          ?.label ?? 'Embedding'
        : 'Embedding';
      model.data.defaultBlockLabel = getDefaultBlockLabel({
        clusteringMethod: 'embedding',
        embeddingLabel,
        minClusterSize: model.data.minClusterSize,
      });
      return;
    }
    const sequenceLabels = model.data.sequencesRef
      .map((r) => {
        const label = model.outputs.sequenceOptions
          ?.find((o) => o.value === r)
          ?.label;
        return label?.replace('InFrame', '') ?? '';
      });
    model.data.defaultBlockLabel = getDefaultBlockLabel({
      clusteringMethod: 'sequence',
      sequenceLabels,
      similarityType: model.data.similarityType,
      identity: model.data.identity,
      coverageThreshold: model.data.coverageThreshold,
      trimStart: model.data.trimStart ?? 0,
      trimEnd: model.data.trimEnd ?? 0,
    });
  });
}
