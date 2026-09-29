import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, request, test, expect } from "@playwright/test";
import type { ElectronApplication } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dedicated port so this doesn't collide with a `npm run dev` instance
// that might already be running locally.
const PORT = "3100";

test.describe("desktop app smoke test", () => {
  let electronApp: ElectronApplication;
  let tmpDir: string;

  test.afterEach(async () => {
    await electronApp?.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("compiles and launches the app, main window opens, embedded server responds", async () => {
    // Isolated data dir per run: electron/main.js only falls back to the real
    // userData path when these aren't already set, so this keeps the test
    // from reading/writing the user's actual attendance data.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "honeycomb-e2e-"));

    electronApp = await electron.launch({
      args: [path.join(__dirname, "..", "electron", "main.js")],
      env: {
        ...process.env,
        PORT,
        HONEYCOMB_DB_PATH: path.join(tmpDir, "honeycomb-data.json"),
        HONEYCOMB_CONFIG_PATH: path.join(tmpDir, "honeycomb-config.json"),
      },
    });

    const window = await electronApp.firstWindow();

    // index.html's own <title> is a scaffold leftover, so assert on the
    // app's rendered heading instead (src/App.tsx) to confirm the window
    // actually loaded the app UI rather than an error page.
    await expect(
      window.getByRole("heading", { name: "The Honeycomb" })
    ).toBeVisible();

    const api = await request.newContext();
    const response = await api.get(`http://localhost:${PORT}/api/health`);
    // Asserting the JSON body (not just response.ok()) matters: server.ts has
    // a catch-all `app.get("*")` that also returns 200 for any unknown route,
    // so response.ok() alone stays green even if /api/health is ever removed.
    expect(await response.json()).toEqual({ status: "ok" });
    await api.dispose();
  });
});
