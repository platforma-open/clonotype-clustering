import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    // Scenarios in a file share one project and run as concurrent blocks on the backend.
    maxConcurrency: 2,
  },
});
