import { describe, expect, it } from "vitest";
import { computeBeehavior, getHiveTier } from "./beehavior";
import type { AttendanceRecord, Attendee } from "./types";

const attendee = (id: string, joinedDate = "2026-01-01"): Attendee => ({
  id,
  name: id,
  enrolledActivities: [],
  joinedDate,
});

let seq = 0;
const rec = (
  attendeeId: string,
  activity: string,
  date: string,
  status: "present" | "absent" = "present"
): AttendanceRecord => ({ id: `r${seq++}`, attendeeId, attendeeName: attendeeId, activity, date, status });

// `n` distinct Reading Club events, attended by `by` (everyone else just defines the event)
const events = (activity: string, dates: string[], by: string, attendedDates: string[] = []) =>
  dates.map(date => rec(by, activity, date, attendedDates.includes(date) ? "present" : "absent"));

const stat = (rows: ReturnType<typeof computeBeehavior>, id: string, activity: string) =>
  rows.find(r => r.attendee.id === id)!.activityStats.find(s => s.activity === activity)!;

const D = (n: number) => `2026-05-${String(n).padStart(2, "0")}`;

describe("computeBeehavior (US-24)", () => {
  it("QA-01: 3 of 8 events attended → 38% (3/8), not 100%", () => {
    const eight = Array.from({ length: 8 }, (_, i) => D(i + 1));
    const records = [
      ...eight.slice(0, 3).map(d => rec("ana", "Reading Club", d)),
      ...eight.slice(3).map(d => rec("otro", "Reading Club", d)),
    ];
    const s = stat(computeBeehavior([attendee("ana"), attendee("otro")], records), "ana", "Reading Club");
    expect(s).toMatchObject({ presents: 3, total: 8, rate: 38, enrolled: true });
  });

  it("QA-02: a single present in a 4-event activity → 25% (1/4) and Dormant", () => {
    const records = [
      rec("ana", "Reading Club", D(1)),
      rec("otro", "Reading Club", D(2)),
      rec("otro", "Reading Club", D(3)),
      rec("otro", "Reading Club", D(4)),
    ];
    const row = computeBeehavior([attendee("ana"), attendee("otro")], records)[0];
    expect(row.activityStats.find(s => s.activity === "Reading Club")).toMatchObject({ presents: 1, total: 4, rate: 25 });
    expect(row.overallRate).toBe(25);
    expect(row.tier.label).toBe("Dormant");
  });

  it("QA-03: events before joinedDate don't count", () => {
    const records = [
      rec("otro", "Music Room", "2026-05-05"),
      rec("otro", "Music Room", "2026-05-12"),
      rec("otro", "Music Room", "2026-05-19"),
      rec("ana", "Music Room", "2026-06-02"),
      rec("otro", "Music Room", "2026-06-16"),
    ];
    const s = stat(computeBeehavior([attendee("ana", "2026-06-01"), attendee("otro")], records), "ana", "Music Room");
    expect(s).toMatchObject({ presents: 1, total: 2, rate: 50 });
  });

  it("QA-04: a non-enrolled activity is null and stays out of Overall", () => {
    const records = [
      rec("ana", "Speakeasy", D(1)),
      ...[2, 3, 4, 5, 6].map(i => rec("otro", "Reading Club", D(i))),
    ];
    const row = computeBeehavior([attendee("ana"), attendee("otro")], records)[0];
    expect(row.activityStats.find(s => s.activity === "Reading Club")).toMatchObject({ enrolled: false, rate: null });
    expect(row.overallTotal).toBe(1);
    expect(row.overallRate).toBe(100);
    expect(row.participatedCount).toBe(1);
  });

  it("QA-05: absence is deduced — missing from an event lowers the %, no records are created or mutated", () => {
    const records = [
      rec("ana", "Speakeasy", D(1)),
      rec("otro", "Speakeasy", D(1)),
      rec("otro", "Speakeasy", D(8)), // ana is missing from this event
    ];
    const snapshot = JSON.stringify(records);
    const s = stat(computeBeehavior([attendee("ana"), attendee("otro")], records), "ana", "Speakeasy");
    expect(s).toMatchObject({ presents: 1, total: 2, rate: 50 });
    expect(JSON.stringify(records)).toBe(snapshot);
    expect(records).toHaveLength(3);
  });

  it("QA-06: an existing absent counts in the denominator and not the numerator", () => {
    const records = [
      rec("ana", "Speakeasy", D(1)),
      rec("ana", "Speakeasy", D(8), "absent"),
    ];
    const s = stat(computeBeehavior([attendee("ana")], records), "ana", "Speakeasy");
    expect(s).toMatchObject({ presents: 1, total: 2, rate: 50 });
  });

  it("an absent-only colleague isn't enrolled in that activity", () => {
    const records = [rec("ana", "Speakeasy", D(1), "absent"), rec("otro", "Speakeasy", D(1))];
    const row = computeBeehavior([attendee("ana"), attendee("otro")], records)[0];
    expect(row.participatedCount).toBe(0);
    expect(row.overallRate).toBeNull();
    expect(row.tier.label).toBe("Dormant");
  });

  it("QA-07: 2/4 Speakeasy + 3/4 Writing Hood → Overall 63% (5/8), Forager, multi-activity", () => {
    const sp = [D(1), D(2), D(3), D(4)];
    const wh = [D(5), D(6), D(7), D(8)];
    const records = [
      ...events("Speakeasy", sp, "ana", sp.slice(0, 2)),
      ...events("Writing Hood", wh, "ana", wh.slice(0, 3)),
    ];
    const row = computeBeehavior([attendee("ana")], records)[0];
    expect(row).toMatchObject({ overallPresents: 5, overallTotal: 8, overallRate: 63, isMulti: true, participatedCount: 2 });
    expect(row.tier.label).toBe("Forager");
  });

  it("a sole present on joinedDate → 100% (1/1)", () => {
    const records = [rec("ana", "Speakeasy", "2026-06-24")];
    const row = computeBeehavior([attendee("ana", "2026-06-24")], records)[0];
    expect(row.activityStats.find(s => s.activity === "Speakeasy")).toMatchObject({ presents: 1, total: 1, rate: 100 });
    expect(row.overallRate).toBe(100);
    expect(row.tier.label).toBe("Busy Bee");
  });

  it("joinedDate is inclusive: the event on that day counts, the day before doesn't", () => {
    const records = [
      rec("otro", "Music Room", "2026-06-09"),
      rec("otro", "Music Room", "2026-06-10"),
      rec("ana", "Music Room", "2026-06-10"),
      rec("otro", "Music Room", "2026-06-17"),
    ];
    const s = stat(computeBeehavior([attendee("ana", "2026-06-10"), attendee("otro")], records), "ana", "Music Room");
    expect(s).toMatchObject({ presents: 1, total: 2, rate: 50 });
  });

  it("a present before joinedDate still counts, so a real date can't push presents out of the denominator", () => {
    const records = [rec("ana", "Speakeasy", "2026-06-24"), rec("otro", "Speakeasy", "2026-06-17")];
    const row = computeBeehavior([attendee("ana", "2026-10-01"), attendee("otro")], records)[0];
    const s = row.activityStats.find(x => x.activity === "Speakeasy")!;
    expect(s).toMatchObject({ enrolled: true, presents: 1, total: 1, rate: 100 });
    expect(row.overallRate).toBe(100);
  });

  it("counts duplicate records of the same event once and keeps rates ≤ 100%", () => {
    const records = [rec("ana", "Speakeasy", D(1)), rec("ana", "Speakeasy", D(1))];
    const s = stat(computeBeehavior([attendee("ana")], records), "ana", "Speakeasy");
    expect(s).toMatchObject({ presents: 1, total: 1, rate: 100 });
  });
});

describe("getHiveTier", () => {
  it.each([
    [0, "Dormant"],
    [25, "Dormant"],
    [26, "Hatcher"],
    [50, "Hatcher"],
    [51, "Forager"],
    [75, "Forager"],
    [76, "Busy Bee"],
    [100, "Busy Bee"],
  ])("%i%% → %s", (rate, label) => {
    expect(getHiveTier(rate).label).toBe(label);
  });
});
