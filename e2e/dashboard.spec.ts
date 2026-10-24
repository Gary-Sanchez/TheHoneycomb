import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { launchVisualApp, SIZES } from "./fixtures/visual-app";
import type { VisualApp } from "./fixtures/visual-app";

// US-61 (BUG-11): in the real Electron app (fixture database), the Bee-havior Hub scrolls sideways on
// its own at 768 and 375 px with the name column pinned, and every column after it can be read in full
// next to the pinned one: scrolled to the end, no Hive Status / Multi-Activity badge starts under it.

const PORT = "3108";
const [, TABLET, PHONE] = SIZES;

test.describe("Bee-havior Hub (US-61)", () => {
  let app: VisualApp;
  let page: Page;

  test.beforeAll(async () => {
    app = await launchVisualApp({ port: PORT, ...PHONE });
    page = app.page;
  });

  test.afterAll(async () => {
    await app?.close();
  });

  for (const size of [TABLET, PHONE]) {
    test(`${size.width} px: scrolled to the end, the last columns are not covered by the pinned name`, async () => {
      await app.setSize(size.width, size.height);
      await app.openTab("Dashboard");
      const hub = page.getByRole("region", { name: "Caserits Bee-havior Hub" });
      await hub.scrollIntoViewIfNeeded();

      // The table scrolls inside its own box, never the page
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
      // Scrolled to the end, the last column (Multi-Activity) is fully visible next to the pinned name
      await hub.evaluate(el => el.scrollTo({ left: el.scrollWidth }));
      const lastColumn = await hub.evaluate(el =>
        [...el.querySelectorAll("tbody tr")].map(row => {
          const pinned = row.querySelector("th")!.getBoundingClientRect().right;
          const cell = [...row.querySelectorAll("td")].at(-1)!;
          const badge = (cell.firstElementChild ?? cell).getBoundingClientRect();
          return { text: cell.textContent, gap: badge.left - pinned, overflow: badge.right - el.getBoundingClientRect().right };
        })
      );
      expect(lastColumn.length).toBeGreaterThan(0);
      for (const { text, gap, overflow } of lastColumn) {
        expect(gap, `"${text}" starts under the pinned name`).toBeGreaterThanOrEqual(-1);
        expect(overflow, `"${text}" is cut on the right`).toBeLessThanOrEqual(1);
      }

      // Hive Status: its badge fits in the room the pinned name leaves, so some scroll shows it whole
      const room = await hub.evaluate(el => {
        const pinned = el.querySelector("tbody th")!.getBoundingClientRect().right;
        return el.getBoundingClientRect().right - pinned;
      });
      const hiveStatus = await hub.evaluate(el =>
        [...el.querySelectorAll("tbody tr")].map(row => {
          const cell = [...row.querySelectorAll("td")].at(-2)!;
          return { text: cell.textContent, width: (cell.firstElementChild ?? cell).getBoundingClientRect().width };
        })
      );
      for (const { text, width } of hiveStatus) expect(width, `"${text}" is wider than the visible room`).toBeLessThanOrEqual(room);
    });
  }
});
