import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { getHiveTier } from "./beehavior";
import { NO_DATA_BADGE } from "./components/HiveStatusBadge";
import { MAX_CSV_BATCH_BYTES, MAX_CSV_BATCH_FILES, checkCsvBatch } from "./uploadLimits";
import { alreadyLoadedMessage, formatDisplayDate, formatImportedAt, pluralize } from "./utils";

const MB = 1024 * 1024;

describe("US-38: .csv batch limits", () => {
  it("accepts 1 to 50 files", () => {
    expect(MAX_CSV_BATCH_FILES).toBe(50);
    expect(checkCsvBatch([{ size: 1 }])).toBeNull();
    expect(checkCsvBatch(Array.from({ length: 50 }, () => ({ size: MB })))).toBeNull();
  });

  it("QA-02/QA-03: 51 files are rejected with the 50-file maximum", () => {
    const error = checkCsvBatch(Array.from({ length: 51 }, () => ({ size: 1 })));
    expect(error).toContain("You selected 51 files");
    expect(error).toContain("maximum is 50 .csv files");
  });

  it("QA-04: a batch over 50 MB in total is rejected with the 50 MB cap", () => {
    expect(MAX_CSV_BATCH_BYTES).toBe(50 * MB);
    expect(checkCsvBatch(Array.from({ length: 5 }, () => ({ size: 10 * MB })))).toBeNull(); // exactly 50 MB
    const error = checkCsvBatch(Array.from({ length: 6 }, () => ({ size: 9 * MB }))); // 54 MB
    expect(error).toContain("54.0 MB");
    expect(error).toContain("maximum is 50 MB");
  });
});

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

  it("QA-04: every badge's text has ≥ 4.5:1 contrast on its background", () => {
    for (const rate of [0, 26, 51, 76]) {
      const tier = getHiveTier(rate);
      expect(contrast(tier.textColor, tier.bgLight), tier.label).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(NO_DATA_BADGE.textColor, NO_DATA_BADGE.bgLight)).toBeGreaterThanOrEqual(4.5);
  });

  it("QA-03: the old scale's labels are gone from the app", () => {
    const dir = join(__dirname, "components");
    const sources = readdirSync(dir).map(f => readFileSync(join(dir, f), "utf8")).join("\n");
    for (const old of ["Excellent Performance", "Good Standing", "Needs Support"]) expect(sources).not.toContain(old);
  });
});

describe("US-46: plurals and dates", () => {
  it("pluralize: 1 colleague / 2 colleagues / 0 colleagues, irregular plurals", () => {
    expect(pluralize(1, "colleague")).toBe("1 colleague");
    expect(pluralize(2, "colleague")).toBe("2 colleagues");
    expect(pluralize(0, "colleague")).toBe("0 colleagues");
    expect(pluralize(3, "activity", "activities")).toBe("3 activities");
  });

  it("formatDisplayDate: ISO → Jun 24, 2026, without timezone shifts", () => {
    expect(formatDisplayDate("2026-06-24")).toBe("Jun 24, 2026");
    expect(formatDisplayDate("2026-01-05")).toBe("Jan 5, 2026");
    expect(formatDisplayDate("2026-12-31T23:59:00Z")).toBe("Dec 31, 2026");
    expect(formatDisplayDate("not a date")).toBe("not a date");
  });

  it("imported-at and already-loaded messages use the same date format", () => {
    expect(formatImportedAt(new Date(2026, 5, 24, 9, 5).toISOString())).toBe("Jun 24, 2026 at 09:05");
    expect(alreadyLoadedMessage({ activity: "Speakeasy", date: "2026-06-10" })).toContain("event on Jun 10, 2026.");
  });
});
