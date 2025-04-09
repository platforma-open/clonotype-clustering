import { model } from '@platforma-open/milaboratories.clonotype-clustering.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './pages/MainPage.vue';
import UMAPPage from './pages/UMAP.vue';
export const sdkPlugin = defineApp(model, () => {
  return {
    routes: {
      '/': () => MainPage,
      '/umap': () => UMAPPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
