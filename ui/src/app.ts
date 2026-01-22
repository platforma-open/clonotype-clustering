import { getDefaultBlockLabel, model } from '@platforma-open/milaboratories.clonotype-clustering.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import { watchEffect } from 'vue';
import BubblePlotPage from './pages/BubblePlotPage.vue';
import MainPage from './pages/MainPage.vue';
import HistogramPage from './pages/HistogramPage.vue';

export const sdkPlugin = defineApp(model, (app) => {
  app.model.args.customBlockLabel ??= '';

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
    const sequenceLabels = model.args.sequencesRef
      .map((r) => {
        const label = model.outputs.sequenceOptions
          ?.find((o) => o.value === r)
          ?.label;
        return label?.replace('InFrame', '') ?? '';
      });
    model.args.defaultBlockLabel = getDefaultBlockLabel({
      sequenceLabels,
      similarityType: model.args.similarityType,
      identity: model.args.identity,
      coverageThreshold: model.args.coverageThreshold,
      trimStart: model.args.trimStart ?? 0,
      trimEnd: model.args.trimEnd ?? 0,
    });
  });
}
