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

  // US-49: the installed app (shortcut / double click) runs with its install folder as cwd, not
  // the repo root. server.ts used to serve dist/ from process.cwd(), so the packaged app answered
  // every page with a 500. Launching from a temp cwd catches that without building the installer.
  test("serves the app and shows the version when launched from a cwd outside the repo", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "honeycomb-e2e-cwd-"));
    const { version } = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
    );
    const cwdPort = "3104";

    electronApp = await electron.launch({
      args: [path.join(__dirname, "..", "electron", "main.js")],
      cwd: tmpDir,
      env: {
        ...process.env,
        PORT: cwdPort,
        HONEYCOMB_DB_PATH: path.join(tmpDir, "honeycomb-data.json"),
        HONEYCOMB_CONFIG_PATH: path.join(tmpDir, "honeycomb-config.json"),
      },
    });

    // The window only loads once the embedded server is listening (main.js retries), so wait for
    // the rendered app before hitting the server directly.
    const window = await electronApp.firstWindow();
    await expect(window.getByRole("heading", { name: "The Honeycomb" })).toBeVisible();

    const api = await request.newContext();
    const page = await api.get(`http://127.0.0.1:${cwdPort}/`);
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain('<div id="root">');
    await api.dispose();

    await window
      .getByRole("navigation", { name: "Main" })
      .getByRole("tab", { name: "Settings" })
      .click();
    await expect(window.locator("#app-version")).toHaveText(`The Honeycomb v${version}`);
  });
});
