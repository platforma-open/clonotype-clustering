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

// The subtitle names the chosen sequence columns as the result pool labels them: "" when none is
// chosen, undefined while the options are loading; a chosen column the loaded options no longer
// list is left out.
function syncSubtitleLabel(model: AppModel) {
  const subtitleLabel = computed<string | undefined>(() => {
    const sequencesRef = model.data.sequencesRef;
    if (sequencesRef.length === 0) return "";
    const sequenceOptions = model.outputs.sequenceOptions;
    if (sequenceOptions === undefined) return undefined;
    return sequencesRef
      .map((ref) => sequenceOptions.find((o) => o.value === ref)?.label.replace("InFrame", ""))
      .filter(Boolean)
      .join(" - ");
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
