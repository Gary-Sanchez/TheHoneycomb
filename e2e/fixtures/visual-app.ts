import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

// US-50 / US-51: Electron launched on this version's fixed database (fixtures/vX.Y.0.json), at
// DPR 1, signed in as admin, with a fixed content size. Shared by e2e/visual.spec.ts (reference
// screenshots) and e2e/snapshot-metrics.spec.ts (audit baseline, docs/SNAPSHOT-4.0.md).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const E2E_DIR = path.join(__dirname, "..");
const ROOT = path.join(E2E_DIR, "..");

// Test-only admin password for the isolated temp data dir (never a real credential).
const TEST_ADMIN_PASSWORD = "e2e-visual-password";

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const [major, minor] = version.split(".");
export const FIXTURE = path.join(__dirname, `v${major}.${minor}.0.json`);

/** Applied while taking screenshots/measuring: hides the scrollbar (see visual.css). */
export const VISUAL_CSS = path.join(E2E_DIR, "visual.css");

export const TABS = [
  { name: "Dashboard", slug: "dashboard" },
  { name: "Manual Check-In", slug: "manual-check-in" },
  { name: "Caserits & Progress", slug: "caserits-progress" },
  { name: "Overlap Cross-Referencer", slug: "overlap-cross-referencer" },
  { name: "Import Forage Logs", slug: "import-forage-logs" },
  { name: "Settings", slug: "settings" },
] as const;

/** Content sizes (CSS px): desktop of US-50, plus the tablet and phone widths of US-51. */
export const SIZES = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
] as const;

export interface VisualApp {
  electronApp: ElectronApplication;
  page: Page;
  /** Resizes the window content and waits until the page reports exactly that size at DPR 1. */
  setSize(width: number, height: number): Promise<void>;
  /** Opens a main tab and waits for the data and the fonts. */
  openTab(name: string): Promise<void>;
  close(): Promise<void>;
}

export async function launchVisualApp(options: { port: string; width: number; height: number }): Promise<VisualApp> {
  // Never point the app at the repo fixture: lowdb writes the file it opens.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "honeycomb-e2e-visual-"));
  const dbPath = path.join(tmpDir, "honeycomb-data.json");
  fs.copyFileSync(FIXTURE, dbPath);

  const electronApp = await electron.launch({
    // Render at DPR 1 whatever the Windows display scaling (100 %, 125 %, 150 %…), so every
    // machine produces the same pixels and the 1440×900 window fits on a 1080p screen.
    args: ["--force-device-scale-factor=1", path.join(ROOT, "electron", "main.js")],
    env: {
      ...process.env,
      PORT: options.port,
      HONEYCOMB_DB_PATH: dbPath,
      HONEYCOMB_CONFIG_PATH: path.join(tmpDir, "honeycomb-config.json"),
      HONEYCOMB_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
    },
  });
  const page = await electronApp.firstWindow();
  await expect(page.getByRole("heading", { name: "The Honeycomb" })).toBeVisible();

  const setSize = async (width: number, height: number) => {
    // A fixed content size, so the results don't depend on the screen or the window frame.
    await electronApp.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
      { width, height }
    );
    // Fail with a clear message (not a pixel diff) if the screen couldn't give us that size/scale.
    // The height matters too: a tab shorter than the viewport (Settings) is captured at the
    // viewport's height (the app root is min-h-screen), so it must be exactly `height` everywhere.
    await expect
      .poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight, window.devicePixelRatio]), {
        message: `the window must be ${width}×${height} CSS px at devicePixelRatio 1`,
      })
      .toEqual([width, height, 1]);
  };

  await setSize(options.width, options.height);

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

  const openTab = async (name: string) => {
    // At 768/375 px the tab bar scrolls horizontally: start from the same scroll position every
    // time, so a tab looks the same whichever tab was open before (or if it runs alone with -g).
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector("#nav-tabs [role=tablist]")?.scrollTo(0, 0);
    });
    // US-59: the nav holds a tablist (Tabs), so each tab is role="tab"
    await page.getByRole("navigation", { name: "Main" }).getByRole("tab", { name }).click();
    await expect(page.getByRole("status").filter({ hasText: "Loading The Honeycomb" })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
  };

  const close = async () => {
    await electronApp.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { electronApp, page, setSize, openTab, close };
}
