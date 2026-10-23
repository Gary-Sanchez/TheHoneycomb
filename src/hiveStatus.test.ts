import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { NO_DATA_TIER, getHiveTier } from "./beehavior";

// WCAG relative luminance / contrast ratio
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("US-42: one Hive Status scale", () => {
  it("QA-01/QA-02: 20/40/60/70/90% → Dormant/Hatcher/Forager/Forager/Busy Bee", () => {
    expect([20, 40, 60, 70, 90].map(r => getHiveTier(r).label)).toEqual(["Dormant", "Hatcher", "Forager", "Forager", "Busy Bee"]);
  });

  it("QA-04: every badge's text, No data included, has ≥ 4.5:1 contrast on its background", () => {
    for (const rate of [0, 26, 51, 76]) {
      const tier = getHiveTier(rate);
      expect(contrast(tier.textColor, tier.bgLight), tier.label).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(NO_DATA_TIER.textColor, NO_DATA_TIER.bgLight)).toBeGreaterThanOrEqual(4.5);
  });

  it("QA-03: the old scale's labels are gone from the app", () => {
    // Files only, subfolders included (components/ui/ since US-56).
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
    const sources = files(join(__dirname, "components")).map(f => readFileSync(f, "utf8")).join("\n");
    for (const old of ["Excellent Performance", "Good Standing", "Needs Support"]) expect(sources).not.toContain(old);
  });

  it("the Hub, Caserits & Progress and the Progress Report all render the shared badge", () => {
    const dir = join(__dirname, "components");
    for (const file of ["DashboardStats.tsx", "ProgressReportModal.tsx"]) {
      expect(readFileSync(join(dir, file), "utf8"), file).toContain("<HiveStatusBadge");
    }
    // US-62: the directory table renders TierBadge (US-58) directly
    expect(readFileSync(join(dir, "AttendeeDirectory.tsx"), "utf8")).toContain("<TierBadge");
  });
});
