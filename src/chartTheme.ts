// US-58: chart colors for recharts, read from the --color-chart-* tokens (src/index.css) so a chart
// and the rest of the UI can't drift apart. recharts takes plain color strings (fill / stroke props),
// so the values are resolved with getComputedStyle; with no DOM (tests, the server) or an empty
// variable, the literal token value below is used instead (designTokens/chartTheme tests keep them
// equal to index.css).

import { ACTIVITIES, type ActivityType } from "./types";

export const CHART_TOKENS = {
  series1: "--color-chart-1",
  series2: "--color-chart-2",
  series3: "--color-chart-3",
  series4: "--color-chart-4",
  primary: "--color-chart-primary",
  grid: "--color-chart-grid",
  axis: "--color-chart-axis",
  axisMuted: "--color-chart-axis-muted",
  tooltipBg: "--color-chart-tooltip-bg",
  tooltipText: "--color-chart-tooltip-text",
  tooltipAccent: "--color-chart-tooltip-accent",
} as const;

export type ChartColorName = keyof typeof CHART_TOKENS;

export const CHART_FALLBACK: Readonly<Record<ChartColorName, string>> = {
  series1: "#4A7A3C",
  series2: "#2D3E35",
  series3: "#C68030",
  series4: "#7A5C9E",
  primary: "#2D3E35",
  grid: "#E9E5D9",
  axis: "#2D3E35",
  axisMuted: "#5F6F3A",
  tooltipBg: "#2D3E35",
  tooltipText: "#FDFBF7",
  tooltipAccent: "#FAEDCD",
};

export interface ChartTheme extends Record<ChartColorName, string> {
  /** series1..4 in ACTIVITIES order. */
  series: string[];
  /** Series color of each activity (same order as ACTIVITIES → chart-1..4). */
  activity: Record<ActivityType, string>;
}

/** Value of a CSS custom property on :root, or "" when there is no DOM. */
function readVar(name: string, root?: Element): string {
  const el = root ?? (typeof document === "undefined" ? undefined : document.documentElement);
  if (!el || typeof getComputedStyle !== "function") return "";
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Resolves every chart color now. Call it at render time (cheap) rather than at module load. */
export function getChartTheme(root?: Element): ChartTheme {
  const colors = Object.fromEntries(
    (Object.keys(CHART_TOKENS) as ChartColorName[]).map(name => [name, readVar(CHART_TOKENS[name], root) || CHART_FALLBACK[name]])
  ) as Record<ChartColorName, string>;
  const series = [colors.series1, colors.series2, colors.series3, colors.series4];
  const activity = Object.fromEntries(ACTIVITIES.map((a, i) => [a, series[i]])) as Record<ActivityType, string>;
  return { ...colors, series, activity };
}
