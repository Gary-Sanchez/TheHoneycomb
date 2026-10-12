import { describe, expect, it } from "vitest";
import { computeBeehavior } from "./beehavior";
import { averageOverall, formatAverageBase } from "./dashboardMetrics";
import type { AttendanceRecord, Attendee } from "./types";

const attendee = (id: string): Attendee => ({ id, name: id, enrolledActivities: [], joinedDate: "2026-01-01" });

let seq = 0;
const rec = (
  attendeeId: string,
  activity: string,
  date: string,
  status: "present" | "absent" = "present"
): AttendanceRecord => ({ id: `r${seq++}`, attendeeId, attendeeName: attendeeId, activity, date, status });

// n distinct dates in 2026 starting Jan 5, one per week
const dates = (n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10));

describe("US-45: averageOverall (Avg. Attendance Rate KPI)", () => {
  it("QA-02: Overall 25%, 50% and 90% plus one No data → 55%, Average of 3 colleagues", () => {
    const ev = dates(20);
    const records = [
      ...ev.map((d, i) => rec("a", "Speakeasy", d, i < 5 ? "present" : "absent")), // 5/20 = 25%
      ...ev.slice(0, 10).map(d => rec("b", "Speakeasy", d)), // 10/20 = 50%
      ...ev.slice(0, 18).map(d => rec("c", "Speakeasy", d)), // 18/20 = 90%
    ];
    const rows = computeBeehavior(["a", "b", "c", "nodata"].map(attendee), records);
    expect(rows.map(r => r.overallRate)).toEqual([25, 50, 90, null]);
    const avg = averageOverall(rows);
    expect(avg).toEqual({ rate: 55, colleagues: 3 });
    expect(formatAverageBase(avg.colleagues)).toBe("Average of 3 colleagues");
  });

  it("singular base and no colleagues with Overall → null (KPI shows —)", () => {
    expect(formatAverageBase(1)).toBe("Average of 1 colleague");
    expect(averageOverall(computeBeehavior([attendee("x")], []))).toEqual({ rate: null, colleagues: 0 });
  });

  it("QA-03: respects the period and matches the Hub's Overall column for it", () => {
    const records = [
      rec("a", "Speakeasy", "2026-05-04"),
      rec("b", "Speakeasy", "2026-06-01"),
      rec("a", "Speakeasy", "2026-06-08"),
    ];
    const june = { start: "2026-06-01", end: "2026-06-30" };
    const rows = computeBeehavior([attendee("a"), attendee("b")], records, june);
    // a: 1/2 = 50%, b: 1/2 = 50%
    expect(averageOverall(rows)).toEqual({ rate: 50, colleagues: 2 });
    // All time: a 2/3 = 67%, b 1/3 = 33% → 50%, but computed over different events
    expect(averageOverall(computeBeehavior([attendee("a"), attendee("b")], records)).rate).toBe(50);
  });
});
