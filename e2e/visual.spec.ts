import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

// US-50: visual regression of the 6 main tabs. Each tab is loaded with the fixed regression
// database of this version (e2e/fixtures/vX.Y.0.json, built by e2e/fixtures/build-fixture.ts)
// and compared pixel by pixel against e2e/snapshots/current/ (see e2e/snapshots/README.md).
// Update the references on purpose with:
//   npx playwright test e2e/visual.spec.ts --update-snapshots

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = "3105";
// Test-only admin password for the isolated temp data dir (never a real credential).
const TEST_ADMIN_PASSWORD = "e2e-visual-password";
const WIDTH = 1440;
const HEIGHT = 900;

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const [major, minor] = version.split(".");
const FIXTURE = path.join(__dirname, "fixtures", `v${major}.${minor}.0.json`);

const TABS = [
  { name: "Dashboard", slug: "dashboard" },
  { name: "Manual Check-In", slug: "manual-check-in" },
  { name: "Caserits & Progress", slug: "caserits-progress" },
  { name: "Overlap Cross-Referencer", slug: "overlap-cross-referencer" },
  { name: "Import Forage Logs", slug: "import-forage-logs" },
  { name: "Settings", slug: "settings" },
];

test.describe("visual regression of the main tabs (US-50)", () => {

  let electronApp: ElectronApplication;
  let page: Page;
  let tmpDir: string;

  test.beforeAll(async () => {
    // Never point the app at the repo fixture: lowdb writes the file it opens.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "honeycomb-e2e-visual-"));
    const dbPath = path.join(tmpDir, "honeycomb-data.json");
    fs.copyFileSync(FIXTURE, dbPath);

    electronApp = await electron.launch({
      args: [path.join(ROOT, "electron", "main.js")],
      env: {
        ...process.env,
        PORT,
        HONEYCOMB_DB_PATH: dbPath,
        HONEYCOMB_CONFIG_PATH: path.join(tmpDir, "honeycomb-config.json"),
        HONEYCOMB_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
      },
    });
    page = await electronApp.firstWindow();
    await expect(page.getByRole("heading", { name: "The Honeycomb" })).toBeVisible();

    // A fixed content size, so the references don't depend on the screen or the window frame.
    await electronApp.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
      { width: WIDTH, height: HEIGHT }
    );
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(WIDTH);

    // Admin session, so every tab shows its edit controls (not the read-only notice)
    const status = await page.evaluate(async password => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      return res.status;
    }, TEST_ADMIN_PASSWORD);
    expect(status).toBe(200);
    await page.reload();
    await expect(page.locator("#auth-badge")).toHaveText("Admin");
  });

  test.afterAll(async () => {
    await electronApp?.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  for (const tab of TABS) {
    test(`${tab.name} matches its reference screenshot`, async () => {
      await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: tab.name }).click();
      await expect(page.getByRole("status").filter({ hasText: "Loading The Honeycomb" })).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // Leave the mouse out of the page, so no hover state ends up in the screenshot
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`${tab.slug}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        stylePath: path.join(__dirname, "visual.css"),
        timeout: 15_000,
      });
    });
  }
});
