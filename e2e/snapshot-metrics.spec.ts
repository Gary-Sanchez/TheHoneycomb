import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { E2E_DIR, launchVisualApp, SIZES, TABS, VISUAL_CSS } from "./fixtures/visual-app";
import type { VisualApp } from "./fixtures/visual-app";

// US-51: audit baseline per tab and width (docs/SNAPSHOT-4.0.md, "Cómo repetir la medición").
// Measurement, not a check: it never fails on the numbers. Skipped in `npm run test:e2e`; run with
//   npm run build && HONEYCOMB_SNAPSHOT_METRICS=1 npx playwright test e2e/snapshot-metrics.spec.ts
// It writes test-results/snapshot-metrics.json (or HONEYCOMB_SNAPSHOT_METRICS_OUT) and prints a table.

const PORT = "3106";
// Playwright empties test-results/ at the start of every run: copy the file, or set
// HONEYCOMB_SNAPSHOT_METRICS_OUT to write it somewhere else.
const OUT = process.env.HONEYCOMB_SNAPSHOT_METRICS_OUT || path.join(E2E_DIR, "..", "test-results", "snapshot-metrics.json");

interface Metrics {
  smallText: { total: number; bySize: Record<string, number>; samples: string[] };
  unnamedControls: { total: number; checked: number; items: string[] };
  scroll: { scrollWidth: number; innerWidth: number; horizontal: boolean };
}

test.describe("audit baseline metrics (US-51)", () => {
  test.skip(process.env.HONEYCOMB_SNAPSHOT_METRICS !== "1", "set HONEYCOMB_SNAPSHOT_METRICS=1 to measure");
  test.setTimeout(180_000);

  let app: VisualApp;

  test.afterAll(async () => {
    await app?.close();
  });

  test("text below 12 px, controls without accessible name and horizontal scroll, per tab and width", async () => {
    app = await launchVisualApp({ port: PORT, ...SIZES[0] });
    const { page } = app;
    const results: Array<{ tab: string; width: number; height: number } & Metrics> = [];

    for (const size of SIZES) {
      await app.setSize(size.width, size.height);
      for (const tab of TABS) {
        await app.openTab(tab.name);
        await page.mouse.move(0, 0);
        // Same CSS as the screenshots: no scrollbar eating 16 px of innerWidth.
        const style = await page.addStyleTag({ path: VISUAL_CSS });
        // Entrance animations (animate-fade-in starts at opacity 0) would make checkVisibility
        // depend on timing: finish the finite ones, as toHaveScreenshot's animations: "disabled" does.
        await page.evaluate(() => {
          for (const animation of document.getAnimations()) {
            if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
          }
        });
        const metrics = await page.evaluate(measurePage);
        await style.evaluate(node => (node as Element).remove());
        results.push({ tab: tab.name, ...size, ...metrics });
      }
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2) + "\n");
    console.log(toTable(results));
    expect(results).toHaveLength(TABS.length * SIZES.length);
  });
});

/** Runs in the page. Kept self-contained (it's serialized by page.evaluate). */
function measurePage(): Metrics {
  const isVisible = (el: Element) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    const html = el as HTMLElement;
    if (typeof html.checkVisibility === "function" && !html.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const snippet = (el: Element) => el.outerHTML.replace(/\s+/g, " ").slice(0, 120);

  // 1. Text with information (a letter or digit) whose element renders below 12 px.
  const bySize: Record<string, number> = {};
  const samples: string[] = [];
  let smallTotal = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    const text = [...el.childNodes]
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent ?? "")
      .join("")
      .trim();
    if (!/[\p{L}\p{N}]/u.test(text)) continue;
    if (!isVisible(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (!(size < 12)) continue;
    smallTotal += 1;
    const key = `${Math.round(size * 100) / 100}px`;
    bySize[key] = (bySize[key] ?? 0) + 1;
    if (samples.length < 8) samples.push(`${key} <${el.tagName.toLowerCase()}> ${text.slice(0, 40)}`);
  }

  // 2. Interactive controls without an accessible name.
  const textOf = (el: Element): string => {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
      else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node as Element;
        if (child.getAttribute("aria-hidden") === "true") continue;
        if (child.tagName === "IMG") out += child.getAttribute("alt") ?? "";
        else if (child.tagName.toLowerCase() === "svg") out += child.getAttribute("aria-label") ?? "";
        else out += child.getAttribute("aria-label") ?? textOf(child);
      }
    }
    return out;
  };
  const accessibleName = (el: Element): string => {
    const label = el.getAttribute("aria-label");
    if (label?.trim()) return label.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim();
      if (text) return text;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      const fromLabels = [...(el.labels ?? [])].map(l => l.textContent ?? "").join(" ").trim();
      if (fromLabels) return fromLabels;
    }
    const title = el.getAttribute("title");
    if (title?.trim()) return title.trim();
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.placeholder.trim()) return el.placeholder.trim();
    if (el instanceof HTMLInputElement && ["button", "submit", "reset"].includes(el.type) && el.value.trim()) return el.value.trim();
    return textOf(el).replace(/\s+/g, " ").trim();
  };
  const controls = document.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="combobox"], summary'
  );
  const unnamed: string[] = [];
  let checked = 0;
  for (const el of controls) {
    if (!isVisible(el)) continue;
    checked += 1;
    if (!accessibleName(el)) unnamed.push(snippet(el));
  }

  // 3. Horizontal scroll of the page.
  const scrollWidth = document.documentElement.scrollWidth;
  const innerWidth = window.innerWidth;

  return {
    smallText: { total: smallTotal, bySize, samples },
    unnamedControls: { total: unnamed.length, checked, items: unnamed },
    scroll: { scrollWidth, innerWidth, horizontal: scrollWidth !== innerWidth },
  };
}

function toTable(rows: Array<{ tab: string; width: number } & Metrics>): string {
  const lines = ["| Pestaña | Ancho | Texto < 12 px | Por tamaño | Controles sin nombre (de visibles) | Scroll horizontal (scrollWidth / innerWidth) |", "|---|---:|---:|---|---:|---|"];
  for (const r of rows) {
    const sizes = Object.entries(r.smallText.bySize).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—";
    lines.push(
      `| ${r.tab} | ${r.width} | ${r.smallText.total} | ${sizes} | ${r.unnamedControls.total} / ${r.unnamedControls.checked} | ${r.scroll.horizontal ? "sí" : "no"} (${r.scroll.scrollWidth} / ${r.scroll.innerWidth}) |`
    );
  }
  return lines.join("\n");
}
