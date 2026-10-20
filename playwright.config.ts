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
  // US-50: toHaveScreenshot references (e2e/visual.spec.ts) live in e2e/snapshots/current/.
  // The frozen per-version copies (e2e/snapshots/vX.Y.0/) are never read or written by a test.
  snapshotPathTemplate: "{testDir}/snapshots/current/{arg}-{platform}{ext}",
});
