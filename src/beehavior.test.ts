import { describe, expect, it } from "vitest";
import {
  ALL_TIME,
  computeBeehavior,
  filterRecordsByPeriod,
  formatPeriodLabel,
  getHiveTier,
  isValidPeriod,
  resolvePeriod,
} from "./beehavior";
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
    expect(row.tier?.label).toBe("Dormant");
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
    expect(row.tier?.label).toBe("Dormant");
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
    expect(row.tier?.label).toBe("Forager");
  });

  it("a sole present in a single-event activity → 100% (1/1)", () => {
    const records = [rec("ana", "Speakeasy", "2026-06-24")];
    const row = computeBeehavior([attendee("ana", "2026-06-24")], records)[0];
    expect(row.activityStats.find(s => s.activity === "Speakeasy")).toMatchObject({ presents: 1, total: 1, rate: 100 });
    expect(row.overallRate).toBe(100);
    expect(row.tier?.label).toBe("Busy Bee");
  });

  it("a present before joinedDate still counts, over the full activity", () => {
    const records = [rec("ana", "Speakeasy", "2026-06-24"), rec("otro", "Speakeasy", "2026-06-17")];
    const row = computeBeehavior([attendee("ana", "2026-10-01"), attendee("otro")], records)[0];
    const s = row.activityStats.find(x => x.activity === "Speakeasy")!;
    expect(s).toMatchObject({ enrolled: true, presents: 1, total: 2, rate: 50 });
    expect(row.overallRate).toBe(50);
  });

  it("counts duplicate records of the same event once and keeps rates ≤ 100%", () => {
    const records = [rec("ana", "Speakeasy", D(1)), rec("ana", "Speakeasy", D(1))];
    const s = stat(computeBeehavior([attendee("ana")], records), "ana", "Speakeasy");
    expect(s).toMatchObject({ presents: 1, total: 1, rate: 100 });
  });
});

describe("computeBeehavior — same events for everyone (US-31)", () => {
  const eight = Array.from({ length: 8 }, (_, i) => D(i + 1));

  it("QA-01: attending only the last of 8 Speakeasy events → 13% (1/8), not 100%", () => {
    const records = [...eight.slice(0, 7).map(d => rec("otro", "Speakeasy", d)), rec("ana", "Speakeasy", eight[7])];
    const s = stat(computeBeehavior([attendee("ana", eight[7]), attendee("otro")], records), "ana", "Speakeasy");
    expect(s).toMatchObject({ presents: 1, total: 8, rate: 13 });
  });

  it("QA-02: events before joinedDate count → Music Room 20% (1/5)", () => {
    const records = [
      rec("otro", "Music Room", "2026-05-05"),
      rec("otro", "Music Room", "2026-05-12"),
      rec("otro", "Music Room", "2026-05-19"),
      rec("ana", "Music Room", "2026-06-02"),
      rec("otro", "Music Room", "2026-06-16"),
    ];
    const s = stat(computeBeehavior([attendee("ana", "2026-06-01"), attendee("otro")], records), "ana", "Music Room");
    expect(s).toMatchObject({ presents: 1, total: 5, rate: 20 });
  });

  it("QA-03: two Reading Club members (6 events) share the denominator; only presents differ", () => {
    const six = eight.slice(0, 6);
    const records = [...six.map(d => rec("ana", "Reading Club", d)), ...six.slice(3).map(d => rec("bea", "Reading Club", d))];
    const rows = computeBeehavior([attendee("ana"), attendee("bea", six[3])], records);
    expect(stat(rows, "ana", "Reading Club")).toMatchObject({ presents: 6, total: 6, rate: 100 });
    expect(stat(rows, "bea", "Reading Club")).toMatchObject({ presents: 3, total: 6, rate: 50 });
  });

  it("QA-04: a non-enrolled activity (Writing Hood, 5 events) is — and stays out of Overall", () => {
    const records = [rec("ana", "Speakeasy", D(1)), ...[2, 3, 4, 5, 6].map(i => rec("otro", "Writing Hood", D(i)))];
    const row = computeBeehavior([attendee("ana"), attendee("otro")], records)[0];
    expect(row.activityStats.find(s => s.activity === "Writing Hood")).toMatchObject({ enrolled: false, rate: null });
    expect(row).toMatchObject({ overallPresents: 1, overallTotal: 1, overallRate: 100 });
  });

  it("QA-05/06: 1/8 Speakeasy + 2/4 Writing Hood → Overall 25% (3/12), Dormant (was Busy Bee under US-24)", () => {
    const wh = [D(11), D(12), D(13), D(14)];
    const records = [
      ...eight.slice(0, 7).map(d => rec("otro", "Speakeasy", d)),
      rec("ana", "Speakeasy", eight[7]),
      rec("otro", "Writing Hood", wh[0]),
      rec("otro", "Writing Hood", wh[1]),
      rec("ana", "Writing Hood", wh[2]),
      rec("ana", "Writing Hood", wh[3]),
    ];
    const row = computeBeehavior([attendee("ana", eight[7]), attendee("otro")], records)[0];
    expect(row).toMatchObject({ overallPresents: 3, overallTotal: 12, overallRate: 25, isMulti: true });
    expect(row.tier?.label).toBe("Dormant");
  });

  it("QA-07: a new event raises the denominator by 1 for every member, without creating absent rows", () => {
    const before = [rec("ana", "Speakeasy", D(1)), rec("bea", "Speakeasy", D(1))];
    const after = [...before, rec("bea", "Speakeasy", D(8))]; // ana isn't in the new event
    const rows = computeBeehavior([attendee("ana"), attendee("bea")], after);
    expect(stat(rows, "ana", "Speakeasy")).toMatchObject({ presents: 1, total: 2, rate: 50 });
    expect(stat(rows, "bea", "Speakeasy")).toMatchObject({ presents: 2, total: 2, rate: 100 });
    expect(after.filter(r => r.status === "absent")).toHaveLength(0);
  });

  it("QA-08: a manual absent counts in the denominator and not the numerator", () => {
    const records = [rec("ana", "Speakeasy", D(1)), rec("ana", "Speakeasy", D(8), "absent"), rec("bea", "Speakeasy", D(8))];
    const rows = computeBeehavior([attendee("ana"), attendee("bea")], records);
    expect(stat(rows, "ana", "Speakeasy")).toMatchObject({ presents: 1, total: 2, rate: 50 });
    expect(stat(rows, "bea", "Speakeasy")).toMatchObject({ presents: 1, total: 2, rate: 50 });
  });
});

describe("period filter (US-35)", () => {
  const may = (n: number) => `2026-05-${String(n).padStart(2, "0")}`;
  const june = (n: number) => `2026-06-${String(n).padStart(2, "0")}`;
  const JUNE = { start: "2026-06-01", end: "2026-06-30" };

  // Speakeasy: 4 events in May, 4 in June; "ana" attended the 4 June ones, "otro" defines the May ones
  const speakeasy = () => [
    ...[1, 8, 15, 22].map(n => rec("otro", "Speakeasy", may(n))),
    ...[1, 8, 15, 22].map(n => rec("ana", "Speakeasy", june(n))),
  ];

  it("QA-02: 4/4 inside June → 100%, All time → 50% (4/8)", () => {
    const rows = (p: typeof JUNE | null) => computeBeehavior([attendee("ana"), attendee("otro")], speakeasy(), p);
    expect(stat(rows(JUNE), "ana", "Speakeasy")).toMatchObject({ presents: 4, total: 4, rate: 100 });
    expect(stat(rows(null), "ana", "Speakeasy")).toMatchObject({ presents: 4, total: 8, rate: 50 });
  });

  it("QA-03: enrolled but absent from every event in the range → 0% (0/2), counted in Overall", () => {
    const records = [
      rec("ana", "Reading Club", may(5)), // enrolls ana, outside the range
      rec("otro", "Reading Club", june(2)),
      rec("otro", "Reading Club", june(16)),
    ];
    const row = computeBeehavior([attendee("ana"), attendee("otro")], records, JUNE)[0];
    expect(row.activityStats.find(s => s.activity === "Reading Club")).toMatchObject({
      enrolled: true,
      presents: 0,
      total: 2,
      rate: 0,
    });
    expect(row).toMatchObject({ overallPresents: 0, overallTotal: 2, overallRate: 0 });
    expect(row.tier?.label).toBe("Dormant");
  });

  it("Multi-Activity counts activities attended in the period, in step with the Inter-Activity KPI", () => {
    const records = [
      rec("ana", "Speakeasy", may(5)), // ana enrolls in both activities in May...
      rec("ana", "Reading Club", may(6)),
      rec("otro", "Speakeasy", june(2)), // ...but only Speakeasy has June events she attends
      rec("ana", "Speakeasy", june(9)),
      rec("otro", "Reading Club", june(3)),
    ];
    const ana = (p: typeof JUNE | null) => computeBeehavior([attendee("ana"), attendee("otro")], records, p)[0];

    // All time: present in 2 activities → multi
    expect(ana(null)).toMatchObject({ participatedCount: 2, isMulti: true });
    // June: present only in Speakeasy → single, although still enrolled (0%) in Reading Club
    expect(ana(JUNE)).toMatchObject({ participatedCount: 1, isMulti: false });
    expect(stat([ana(JUNE)], "ana", "Reading Club")).toMatchObject({ enrolled: true, presents: 0, total: 1, rate: 0 });
  });

  it("an enrolled colleague with no events in the range has no Overall and no Hive Status", () => {
    const records = [rec("ana", "Writing Hood", may(5)), rec("otro", "Speakeasy", june(2))];
    const row = computeBeehavior([attendee("ana"), attendee("otro")], records, JUNE)[0];
    expect(row.attendee.id).toBe("ana");
    expect(row.overallRate).toBeNull();
    expect(row.tier).toBeNull();
    // All time keeps US-24: no rate → Dormant
    expect(computeBeehavior([attendee("nuevo")], records, null)[0].tier?.label).toBe("Dormant");
  });

  it("QA-04: an activity without events in the range is — for everyone and stays out of Overall", () => {
    const records = [
      rec("ana", "Writing Hood", may(5)), // enrolled, but the only event is outside the range
      rec("ana", "Speakeasy", june(1)),
      rec("otro", "Speakeasy", june(8)),
    ];
    const rows = computeBeehavior([attendee("ana"), attendee("otro")], records, JUNE);
    expect(stat(rows, "ana", "Writing Hood")).toMatchObject({ enrolled: true, total: 0, rate: null });
    expect(stat(rows, "otro", "Writing Hood")).toMatchObject({ enrolled: false, rate: null });
    expect(rows[0].overallTotal).toBe(2); // Speakeasy only
  });

  it("a colleague not enrolled in an activity stays — even when it has events in the range", () => {
    const records = [rec("ana", "Speakeasy", june(1)), rec("otro", "Music Room", june(2))];
    const rows = computeBeehavior([attendee("ana"), attendee("otro")], records, JUNE);
    expect(stat(rows, "ana", "Music Room")).toMatchObject({ enrolled: false, rate: null });
  });

  it("both ends of the range are included", () => {
    const records = [rec("ana", "Speakeasy", "2026-06-01"), rec("ana", "Speakeasy", "2026-06-30"), rec("ana", "Speakeasy", "2026-07-01")];
    expect(filterRecordsByPeriod(records, JUNE).map(r => r.date)).toEqual(["2026-06-01", "2026-06-30"]);
  });

  it("a null period returns every record and leaves the input untouched", () => {
    const records = speakeasy();
    const before = JSON.stringify(records);
    expect(filterRecordsByPeriod(records, null)).toBe(records);
    computeBeehavior([attendee("ana"), attendee("otro")], records, JUNE);
    expect(JSON.stringify(records)).toBe(before);
  });

  it("isValidPeriod / resolvePeriod: only a complete, ordered custom range is applied", () => {
    expect(isValidPeriod("2026-06-01", "2026-06-01")).toBe(true);
    expect(isValidPeriod("2026-06-30", "2026-06-01")).toBe(false);
    expect(isValidPeriod("2026-06-01", "")).toBe(false);
    expect(resolvePeriod(ALL_TIME)).toBeNull();
    expect(resolvePeriod({ mode: "custom", start: "2026-06-30", end: "2026-06-01" })).toBeNull();
    expect(resolvePeriod({ mode: "custom", start: "2026-06-01", end: "2026-06-30" })).toEqual(JUNE);
  });

  it("formatPeriodLabel: same year once, spanning years on both ends", () => {
    expect(formatPeriodLabel(JUNE)).toBe("Jun 1 – Jun 30, 2026");
    expect(formatPeriodLabel({ start: "2025-12-01", end: "2026-01-31" })).toBe("Dec 1, 2025 – Jan 31, 2026");
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
