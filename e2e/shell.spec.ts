import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { launchVisualApp, SIZES, TABS } from "./fixtures/visual-app";
import type { VisualApp } from "./fixtures/visual-app";

// US-59: the accessible, responsive app shell in the real Electron app (fixture database, admin
// session): keyboard tabs, window title per tab, skip link, nav always visible (BUG-10) and no page
// horizontal scroll from the header, nav or footer at 768 and 375 px.

const PORT = "3106";
const [DESKTOP, TABLET, PHONE] = SIZES;

test.describe("app shell (US-59)", () => {
  let app: VisualApp;
  let page: Page;
  const nav = () => page.getByRole("navigation", { name: "Main" });

  test.beforeAll(async () => {
    app = await launchVisualApp({ port: PORT, ...DESKTOP });
    page = app.page;
  });

  test.afterAll(async () => {
    await app?.close();
  });

  test("arrows, Home and End move between the tabs and the title names the open tab", async () => {
    await app.setSize(DESKTOP.width, DESKTOP.height);
    await app.openTab("Dashboard");
    await expect(page).toHaveTitle("Dashboard · The Honeycomb");
    await nav().getByRole("tab", { name: "Dashboard" }).focus();

    await page.keyboard.press("ArrowRight");
    await expect(nav().getByRole("tab", { name: "Manual Check-In" })).toBeFocused();
    await expect(nav().getByRole("tab", { name: "Manual Check-In" })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveTitle("Manual Check-In · The Honeycomb");

    await page.keyboard.press("End");
    await expect(nav().getByRole("tab", { name: "Settings" })).toBeFocused();
    await expect(page).toHaveTitle("Settings · The Honeycomb");

    await page.keyboard.press("Home");
    await expect(nav().getByRole("tab", { name: "Dashboard" })).toBeFocused();
    await expect(nav().getByRole("tab")).toHaveText(TABS.map(tab => tab.name));
  });

  test("Skip to content is the first Tab stop and moves focus to the tab content", async () => {
    await app.setSize(DESKTOP.width, DESKTOP.height);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "The Honeycomb" })).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  for (const size of [TABLET, PHONE]) {
    test(`${size.width} px: no page horizontal scroll and the nav stays visible below the header`, async () => {
      await app.setSize(size.width, size.height);
      for (const tab of TABS) {
        await app.openTab(tab.name);
        // Header, nav and footer fit the viewport (a wide table inside a tab scrolls on its own)
        for (const selector of ["#main-header", "#nav-tabs", "footer"]) {
          const box = await page.locator(selector).evaluate(el => [el.scrollWidth, el.clientWidth]);
          expect(box[0], `${selector} on ${tab.name}`).toBeLessThanOrEqual(box[1]);
          const right = await page.locator(selector).evaluate(el => el.getBoundingClientRect().right);
          expect(right, `${selector} on ${tab.name}`).toBeLessThanOrEqual(size.width);
        }
      }

      // BUG-10: scrolled down, the nav is still right below the header
      await app.openTab("Caserits & Progress");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const header = await page.locator("#main-header").boundingBox();
      const navBox = await nav().boundingBox();
      expect(navBox!.y).toBeCloseTo(header!.y + header!.height, 0);
      await expect(nav().getByRole("tab", { name: "Caserits & Progress" })).toBeInViewport();
    });
  }
});
