import { describe, expect, it } from "vitest";
import { alreadyLoadedMessage, formatDisplayDate, formatImportedAt, pluralize } from "./utils";

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
