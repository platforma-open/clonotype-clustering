import { model } from '@platforma-open/milaboratories.clonotype-clustering.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import { watch } from 'vue';
import BubblePlotPage from './pages/BubblePlotPage.vue';
import MainPage from './pages/MainPage.vue';
import HistogramPage from './pages/HistogramPage.vue';
export const sdkPlugin = defineApp(model, (app) => {
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

// Make sure labels are initialized
const unwatch = watch(sdkPlugin, ({ loaded }) => {
  if (!loaded) return;
  const app = useApp();
  app.model.args.customBlockLabel ??= '';
  app.model.args.defaultBlockLabel ??= 'Select Dataset';
  unwatch();
});
