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
  watchEffect(() => {
    const sequenceLabels = model.data.sequencesRef
      .map((r) => {
        const label = model.outputs.sequenceOptions
          ?.find((o) => o.value === r)
          ?.label;
        return label?.replace('InFrame', '') ?? '';
      });
    model.data.defaultBlockLabel = getDefaultBlockLabel({
      sequenceLabels,
      similarityType: model.data.similarityType,
      identity: model.data.identity,
      coverageThreshold: model.data.coverageThreshold,
      trimStart: model.data.trimStart ?? 0,
      trimEnd: model.data.trimEnd ?? 0,
    });
  });
}
