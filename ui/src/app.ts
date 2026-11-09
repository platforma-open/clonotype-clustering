import { platforma } from "@platforma-open/milaboratories.clonotype-clustering.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import { computed, watch } from "vue";
import BubblePlotPage from "./pages/BubblePlotPage.vue";
import MainPage from "./pages/MainPage.vue";
import HistogramPage from "./pages/HistogramPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  app.model.data.customBlockLabel ??= "";

  syncSubtitleLabel(app.model);

  return {
    progress: () => {
      return app.model.outputs.isRunning;
    },
    routes: {
      "/": () => MainPage,
      "/bubble": () => BubblePlotPage,
      "/histogram": () => HistogramPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;

type AppModel = ReturnType<typeof useApp>["model"];

// The subtitle names the chosen sequence columns as the result pool labels them:
// "" when none is chosen, undefined while a chosen column's option is not loaded yet.
function syncSubtitleLabel(model: AppModel) {
  const subtitleLabel = computed<string | undefined>(() => {
    const sequenceOptions = model.outputs.sequenceOptions;
    const labels: string[] = [];
    for (const r of model.data.sequencesRef) {
      const label = sequenceOptions?.find((o) => o.value === r)?.label;
      if (label === undefined) return undefined;
      labels.push(label.replace("InFrame", ""));
    }
    return labels.filter(Boolean).join(" - ");
  });

  watch(
    subtitleLabel,
    (label) => {
      if (label !== undefined && label !== model.data.subtitleLabel) {
        model.data.subtitleLabel = label;
      }
    },
    { immediate: true },
  );
}
