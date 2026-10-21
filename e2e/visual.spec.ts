import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { launchVisualApp, SIZES, TABS, VISUAL_CSS } from "./fixtures/visual-app";
import type { VisualApp } from "./fixtures/visual-app";

// US-50: visual regression of the 6 main tabs. Each tab is loaded with the fixed regression
// database of this version (e2e/fixtures/vX.Y.0.json, built by e2e/fixtures/build-fixture.ts)
// and compared pixel by pixel against e2e/snapshots/current/ (see e2e/snapshots/README.md).
// US-51 adds the 6 tabs at 768 and 375 px and the Progress Report / Outcome Report modals open
// at 1440, 768 and 375 px (same fixture, same app instance).
// Update the references on purpose with:
//   npx playwright test e2e/visual.spec.ts --update-snapshots

const PORT = "3105";
const [DESKTOP, ...NARROW] = SIZES;

const SCREENSHOT_OPTIONS = {
  animations: "disabled" as const,
  caret: "hide" as const,
  stylePath: VISUAL_CSS,
  timeout: 15_000,
};

test.describe("visual regression of the main tabs (US-50)", () => {
  let app: VisualApp;
  let page: Page;

  test.beforeAll(async () => {
    app = await launchVisualApp({ port: PORT, ...DESKTOP });
    page = app.page;
  });

  test.afterAll(async () => {
    await app?.close();
  });

  // US-50 references (1440×900): `<slug>-win32.png`
  for (const tab of TABS) {
    test(`${tab.name} matches its reference screenshot`, async () => {
      await app.setSize(DESKTOP.width, DESKTOP.height);
      await app.openTab(tab.name);
      // Leave the mouse out of the page, so no hover state ends up in the screenshot
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`${tab.slug}.png`, { fullPage: true, ...SCREENSHOT_OPTIONS });
    });
  }

  // US-51 references (768×1024 and 375×812): `<slug>-<width>-win32.png`
  for (const size of NARROW) {
    for (const tab of TABS) {
      test(`${tab.name} at ${size.width} px matches its reference screenshot`, async () => {
        await app.setSize(size.width, size.height);
        await app.openTab(tab.name);
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot(`${tab.slug}-${size.width}.png`, { fullPage: true, ...SCREENSHOT_OPTIONS });
      });
    }
  }

  // US-51: the two report modals open, viewport only (they are fixed overlays):
  // `progress-report-<width>-win32.png`, `outcome-report-<width>-win32.png`
  for (const size of SIZES) {
    test(`Progress Report at ${size.width} px matches its reference screenshot`, async () => {
      await app.setSize(size.width, size.height);
      await app.openTab("Caserits & Progress");
      await page.getByRole("row").filter({ hasText: "Elena Rostova" }).getByRole("button", { name: "Progress Report" }).click();
      const modal = page.locator("#progress-report-modal");
      await expect(modal).toBeVisible();
      await waitForChartBars(page, "#progress-report-modal");
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`progress-report-${size.width}.png`, { fullPage: false, ...SCREENSHOT_OPTIONS });
      await page.getByRole("button", { name: "Close progress report" }).click();
      await expect(modal).toHaveCount(0);
    });

    test(`Outcome Report at ${size.width} px matches its reference screenshot`, async () => {
      await app.setSize(size.width, size.height);
      await app.openTab("Dashboard");
      await page.locator("#generate-outcome-report").click();
      const modal = page.locator("#outcome-report-modal");
      await expect(modal).toBeVisible();
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`outcome-report-${size.width}.png`, { fullPage: false, ...SCREENSHOT_OPTIONS });
      // In 4.0 the sticky header/nav paint over the top of this modal (docs/SNAPSHOT-4.0.md) and
      // intercept a real click on the close button at some sizes, so the click is dispatched.
      await page.getByRole("button", { name: "Close Outcome Report" }).dispatchEvent("click");
      await expect(modal).toHaveCount(0);
    });
  }
});

/**
 * The Progress Report chart (recharts <Bar>) animates its bars in with JS, which
 * `animations: "disabled"` doesn't stop: wait until every bar keeps the same size for a while.
 */
async function waitForChartBars(page: Page, root: string) {
  let previous = "";
  let stableFor = 0;
  await expect
    .poll(
      async () => {
        const current = await page.evaluate(sel => {
          const bars = [...document.querySelectorAll(`${sel} .recharts-bar-rectangle path, ${sel} .recharts-bar-rectangle rect`)];
          return JSON.stringify(bars.map(b => b.getAttribute("d") ?? `${b.getAttribute("height")}`));
        }, root);
        stableFor = current === previous && current !== "[]" ? stableFor + 1 : 0;
        previous = current;
        return stableFor;
      },
      { message: "the Progress Report chart bars must stop animating", intervals: [250], timeout: 10_000 }
    )
    .toBeGreaterThanOrEqual(3);
}
