import { describe, expect, it } from "vitest";
import { formatPeriodLabel } from "./beehavior";
import { formatDate, formatPercent, MONTH_ABBR } from "./format";
import { formatDisplayDate } from "./utils";

describe("US-58: formatDate", () => {
  it("QA-05: ISO 2026-06-24 → Jun 24, 2026", () => {
    expect(formatDate("2026-06-24")).toBe("Jun 24, 2026");
  });

  it("no leading zero on the day, every month abbreviated, timezone-proof", () => {
    expect(formatDate("2026-01-05")).toBe("Jan 5, 2026");
    expect(formatDate("2026-12-31T23:59:00Z")).toBe("Dec 31, 2026");
    expect(MONTH_ABBR.map((_, i) => formatDate(`2026-${String(i + 1).padStart(2, "0")}-01`).slice(0, 3))).toEqual([...MONTH_ABBR]);
  });

  it("unparseable input is returned as is", () => {
    expect(formatDate("not a date")).toBe("not a date");
    expect(formatDate("2026-13-01")).toBe("2026-13-01");
    expect(formatDate("")).toBe("");
  });

  it("formatDisplayDate (utils) is the same function, and period labels share the month names", () => {
    expect(formatDisplayDate).toBe(formatDate);
    expect(formatPeriodLabel({ start: "2025-12-01", end: "2026-01-31" })).toBe("Dec 1, 2025 – Jan 31, 2026");
  });
});

describe("US-58: formatPercent", () => {
  it("QA-05: 0.756 → 76%", () => {
    expect(formatPercent(0.756)).toBe("76%");
  });

  it("whole numbers, % attached, Math.round", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.754)).toBe("75%");
    expect(formatPercent(0.755)).toBe("76%");
    expect(formatPercent(2 / 3)).toBe("67%");
    expect(formatPercent(-0.001)).toBe("0%");
  });

  it("gives the same number as the screens' own rounding (presents / total)", () => {
    for (let total = 1; total <= 40; total++) {
      for (let presents = 0; presents <= total; presents++) {
        expect(formatPercent(presents / total)).toBe(`${Math.round((presents / total) * 100)}%`);
      }
    }
  });

  it("a missing value shows the tables' placeholder —", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
