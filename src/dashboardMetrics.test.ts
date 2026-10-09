import { describe, expect, it } from "vitest";
import { computeBeehavior, getAttendedActivities } from "./beehavior";
import {
  averageOverall,
  computeActivityComparison,
  computeAttendanceTrends,
  computeEngagement,
  formatAverageBase,
} from "./dashboardMetrics";
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

describe("US-43: getAttendedActivities", () => {
  it("QA-01: present in Speakeasy + only absent in Music Room → participates only in Speakeasy (Single)", () => {
    const records = [rec("ana", "Speakeasy", "2026-05-01"), rec("ana", "Music Room", "2026-05-02", "absent")];
    expect(getAttendedActivities([attendee("ana")], records)).toEqual({ ana: ["Speakeasy"] });
  });

  it("QA-04: present in 3 activities → 3 (Super Active), in ACTIVITIES order", () => {
    const records = [
      rec("ana", "Writing Hood", "2026-05-03"),
      rec("ana", "Speakeasy", "2026-05-01"),
      rec("ana", "Reading Club", "2026-05-02"),
      rec("ana", "Speakeasy", "2026-05-08"),
    ];
    expect(getAttendedActivities([attendee("ana")], records).ana).toEqual(["Speakeasy", "Reading Club", "Writing Hood"]);
  });

  it("QA-02: agrees with the Hub's Multi-Activity count", () => {
    const records = [
      rec("ana", "Speakeasy", "2026-05-01"),
      rec("ana", "Music Room", "2026-05-02", "absent"),
      rec("bea", "Speakeasy", "2026-05-01"),
      rec("bea", "Reading Club", "2026-05-02"),
    ];
    const people = [attendee("ana"), attendee("bea"), attendee("cero")];
    const map = getAttendedActivities(people, records);
    const hub = computeBeehavior(people, records);
    for (const row of hub) expect(map[row.attendee.id].length).toBe(row.participatedCount);
    expect(map.cero).toEqual([]);
  });
});

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

describe("US-36: Attendance Trends", () => {
  it("QA-02: records from January to June, All time → the 6 months, not a fixed Apr–Jun", () => {
    const records = ["01", "02", "03", "04", "05", "06"].map(m => rec("a", "Speakeasy", `2026-${m}-10`));
    const points = computeAttendanceTrends([attendee("a")], records, null, "month");
    expect(points.map(p => p.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"]);
    expect(points.every(p => p.events === 1 && p.rate === 100)).toBe(true);
  });

  it("QA-07: a month with no events in between is No data (null), not 0%", () => {
    const records = [rec("a", "Speakeasy", "2026-01-10"), rec("a", "Speakeasy", "2026-03-10")];
    const [jan, feb, mar] = computeAttendanceTrends([attendee("a")], records, null, "month");
    expect(jan.rate).toBe(100);
    expect(feb).toMatchObject({ label: "Feb 2026", events: 0, avgAttendees: null, rate: null });
    expect(mar.rate).toBe(100);
  });

  it("rates are event-based: one present out of two events → 50%, avg attendees per event", () => {
    const records = [rec("a", "Speakeasy", "2026-05-04"), rec("b", "Speakeasy", "2026-05-04"), rec("b", "Speakeasy", "2026-05-11")];
    const [may] = computeAttendanceTrends([attendee("a"), attendee("b")], records, null, "month");
    // a 1/2 = 50%, b 2/2 = 100% → 75%; 3 presents over 2 events = 1.5
    expect(may).toMatchObject({ events: 2, avgAttendees: 1.5, rate: 75 });
  });

  it("weekly grouping starts on Monday and is clamped to the period", () => {
    const records = [rec("a", "Speakeasy", "2026-06-03"), rec("a", "Speakeasy", "2026-06-10")]; // Wed, Wed
    const period = { start: "2026-06-02", end: "2026-06-30" };
    const points = computeAttendanceTrends([attendee("a")], records, period, "week");
    expect(points.map(p => [p.start, p.end])).toEqual([
      ["2026-06-02", "2026-06-07"], // week of Mon Jun 1, clamped to the period start
      ["2026-06-08", "2026-06-14"],
    ]);
    expect(points[0].label).toBe("Week of Jun 2");
  });

  it("no records in the period → no intervals", () => {
    expect(computeAttendanceTrends([attendee("a")], [], null, "month")).toEqual([]);
  });
});

describe("US-36: Cross-Activity Comparisons", () => {
  it("QA-03: 4 events with 6, 8, 7 and 9 attendees → 4 events, average 7.5", () => {
    const sizes = [6, 8, 7, 9];
    const records = sizes.flatMap((size, i) =>
      Array.from({ length: size }, (_, p) => rec(`p${p}`, "Reading Club", `2026-05-0${i + 1}`))
    );
    const people = Array.from({ length: 9 }, (_, p) => attendee(`p${p}`));
    const rows = computeBeehavior(people, records);
    const rc = computeActivityComparison(rows, records, null).find(c => c.activity === "Reading Club")!;
    expect(rc).toMatchObject({ events: 4, avgAttendees: 7.5, uniqueAttendees: 9 });
  });

  it("QA-04: the activity rate is the average of the Hub's cells, not presents ÷ records", () => {
    // Only present rows (as a .csv brings them): presents ÷ records would be 100%
    const records = [rec("a", "Speakeasy", "2026-05-04"), rec("b", "Speakeasy", "2026-05-11"), rec("b", "Speakeasy", "2026-05-18")];
    const rows = computeBeehavior([attendee("a"), attendee("b")], records);
    const sp = computeActivityComparison(rows, records, null).find(c => c.activity === "Speakeasy")!;
    // a 1/3 = 33%, b 2/3 = 67% → 50%
    expect(sp.avgRate).toBe(50);
    const music = computeActivityComparison(rows, records, null).find(c => c.activity === "Music Room")!;
    expect(music).toMatchObject({ events: 0, avgAttendees: null, uniqueAttendees: 0, avgRate: null });
  });
});

describe("US-36: Engagement", () => {
  it("QA-05: 3 Busy Bee and 2 colleagues whose first Speakeasy attendance falls in the period", () => {
    const june = { start: "2026-06-01", end: "2026-06-30" };
    const records = [
      // old1 joined Speakeasy in May; new1/new2 attend for the first time in June
      rec("old1", "Speakeasy", "2026-05-04"),
      rec("old1", "Speakeasy", "2026-06-01"),
      rec("new1", "Speakeasy", "2026-06-01"),
      rec("new2", "Speakeasy", "2026-06-01"),
    ];
    const people = ["old1", "new1", "new2", "nodata"].map(attendee);
    const rows = computeBeehavior(people, records, june);
    const e = computeEngagement(rows, records, june);
    expect(e.tiers.find(t => t.label === "Busy Bee")!.count).toBe(3);
    expect(e.tiers.find(t => t.label === "Dormant")!.count).toBe(0); // No data isn't Dormant
    expect(e.noData).toBe(1);
    expect(e.newByActivity.find(n => n.activity === "Speakeasy")!.count).toBe(2);
    expect(e.newColleagues).toBe(2);
  });

  it("an enrolled colleague who missed every event of the period is Dormant (0%)", () => {
    const june = { start: "2026-06-01", end: "2026-06-30" };
    const records = [rec("ana", "Speakeasy", "2026-05-04"), rec("otro", "Speakeasy", "2026-06-01")];
    const rows = computeBeehavior([attendee("ana"), attendee("otro")], records, june);
    const e = computeEngagement(rows, records, june);
    expect(e.tiers.find(t => t.label === "Dormant")!.count).toBe(1);
    expect(e.tiers.find(t => t.label === "Busy Bee")!.count).toBe(1);
  });
});
