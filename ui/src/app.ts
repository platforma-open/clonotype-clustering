import { model } from '@platforma-open/milaboratories.clonotype-clustering.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import BubblePlotPage from './pages/BubblePlotPage.vue';
import MainPage from './pages/MainPage.vue';
export const sdkPlugin = defineApp(model, (app) => {
  return {
    progress: () => {
      return app.model.outputs.isRunning;
    },
    routes: {
      '/': () => MainPage,
      '/bubble': () => BubblePlotPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
