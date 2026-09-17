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

  test.afterEach(async () => {
    await electronApp?.close();
  });

  test("compiles and launches the app, main window opens, embedded server responds", async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, "..", "electron", "main.js")],
      env: { ...process.env, PORT },
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
    expect(response.ok()).toBeTruthy();
    await api.dispose();
  });
});
