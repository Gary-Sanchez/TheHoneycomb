// @vitest-environment jsdom
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHART_FALLBACK, CHART_TOKENS, getChartTheme, type ChartColorName } from "./chartTheme";
import { ACTIVITIES } from "./types";

const css = readFileSync(join(__dirname, "index.css"), "utf8");
const declared = new Map<string, string>();
for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!declared.has(m[1])) declared.set(m[1], m[2].trim());
const resolve = (name: string): string => {
  const value = declared.get(name);
  if (value === undefined) throw new Error(`${name} is not declared in src/index.css`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(ref[1]) : value;
};

const names = Object.keys(CHART_TOKENS) as ChartColorName[];

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
});

describe("US-58: chartTheme", () => {
  it("every chart token exists in index.css and its fallback equals the token's value", () => {
    for (const name of names) {
      expect(resolve(CHART_TOKENS[name]).toUpperCase(), CHART_TOKENS[name]).toBe(CHART_FALLBACK[name].toUpperCase());
    }
  });

  it("reads the colors from the CSS variables on :root", () => {
    document.documentElement.style.setProperty("--color-chart-1", "#123456");
    document.documentElement.style.setProperty("--color-chart-grid", " #ABCDEF ");
    const theme = getChartTheme();
    expect(theme.series1).toBe("#123456");
    expect(theme.series[0]).toBe("#123456");
    expect(theme.activity.Speakeasy).toBe("#123456");
    expect(theme.grid).toBe("#ABCDEF");
  });

  it("falls back to the token values when a variable is empty (no stylesheet, e.g. tests)", () => {
    const theme = getChartTheme();
    for (const name of names) expect(theme[name]).toBe(CHART_FALLBACK[name]);
  });

  it("with no DOM at all (server / SSR) it returns the fallback values", () => {
    vi.stubGlobal("document", undefined);
    expect(getChartTheme().series).toEqual([CHART_FALLBACK.series1, CHART_FALLBACK.series2, CHART_FALLBACK.series3, CHART_FALLBACK.series4]);
  });

  it("series 1..4 and the per-activity map follow ACTIVITIES order", () => {
    const theme = getChartTheme();
    expect(theme.series).toEqual([theme.series1, theme.series2, theme.series3, theme.series4]);
    ACTIVITIES.forEach((activity, i) => expect(theme.activity[activity]).toBe(theme.series[i]));
  });
});
