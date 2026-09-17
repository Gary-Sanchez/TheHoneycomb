import { defineConfig } from "@playwright/test";

// Tests launch the packaged Electron app directly (via `_electron.launch`
// inside each spec), not a browser project — a single worker avoids two
// app instances competing for the same port and userData files.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
