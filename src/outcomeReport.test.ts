import { describe, expect, it } from "vitest";
import { computeBeehavior } from "./beehavior";
import {
  OutcomeReportConfig,
  ReportSection,
  buildOutcomeReport,
  describeCriteria,
  formatAttendance,
  formatOutcomeReport,
  hasReportBlock,
  parseTopN,
  reportFilename,
} from "./outcomeReport";
import type { AttendanceRecord, Attendee } from "./types";

const person = (name: string): Attendee => ({ id: name, name, enrolledActivities: [], joinedDate: "2026-01-01" });

let seq = 0;
const rec = (
  attendeeId: string,
  activity: string,
  date: string,
  status: "present" | "absent" = "present"
): AttendanceRecord => ({ id: `r${seq++}`, attendeeId, attendeeName: attendeeId, activity, date, status });

// `name` attends the first `attended` of `dates` (absent the rest) — the dates define the events
const attends = (name: string, activity: string, dates: string[], attended: number) =>
  dates.map((d, i) => rec(name, activity, d, i < attended ? "present" : "absent"));

const D = (n: number) => `2026-05-${String(n).padStart(2, "0")}`;
const days = (from: number, count: number) => Array.from({ length: count }, (_, i) => D(from + i));

const config = (over: Partial<OutcomeReportConfig> = {}): OutcomeReportConfig => ({
  period: null,
  activityTops: {},
  overallTop: 0,
  tiers: [],
  ...over,
});

const section = (sections: ReportSection[], title: string) => sections.find(s => s.title === title)!;
const names = (s: ReportSection) => s.rows.map(r => r.name);

describe("buildOutcomeReport — Top per activity (US-40)", () => {
  // Speakeasy: 5 events. Reading Club: 4 events.
  const speak = days(1, 5);
  const read = days(10, 4);
  const attendees = ["Ana", "Bea", "Cid", "Dan", "Eva", "Fer"].map(person);
  const records = [
    ...attends("Ana", "Speakeasy", speak, 5),
    ...attends("Bea", "Speakeasy", speak, 3),
    ...attends("Cid", "Speakeasy", speak, 4),
    ...attends("Dan", "Speakeasy", speak, 1),
    ...attends("Eva", "Speakeasy", speak, 2),
    ...attends("Ana", "Reading Club", read, 1),
    ...attends("Bea", "Reading Club", read, 4),
    ...attends("Cid", "Reading Club", read, 2),
  ];

  it("ranks each activity with its own N, highest rate first, and leaves out N = 0 / missing", () => {
    const sections = buildOutcomeReport(
      attendees,
      records,
      config({ activityTops: { Speakeasy: 3, "Reading Club": 2, "Music Room": 0 } })
    );
    expect(sections.map(s => s.title)).toEqual(["Top 3 — Speakeasy", "Top 2 — Reading Club"]);
    const sp = section(sections, "Top 3 — Speakeasy");
    expect(names(sp)).toEqual(["Ana", "Cid", "Bea"]);
    expect(sp.rows.map(r => r.position)).toEqual([1, 2, 3]);
    expect(sp.rows[1]).toMatchObject({ activity: "Speakeasy", rate: 80, presents: 4, total: 5 });
    expect(sp.notice).toBeNull();
    expect(names(section(sections, "Top 2 — Reading Club"))).toEqual(["Bea", "Cid"]);
  });

  it("lists fewer than N with an 'Only X colleagues' notice, never ranking anyone at 0%", () => {
    // Fer is enrolled in Reading Club (present on Jan 1) but attended nothing in the period → 0%, not ranked
    const sections = buildOutcomeReport(
      attendees,
      [...records, rec("Fer", "Reading Club", "2026-01-01")],
      config({ period: { start: D(1), end: D(31) }, activityTops: { "Reading Club": 5 } })
    );
    const rc = section(sections, "Top 5 — Reading Club");
    expect(names(rc)).toEqual(["Bea", "Cid", "Ana"]);
    expect(rc.notice).toBe("Only 3 colleagues attended Reading Club in this period");
  });

  it("shows 'No events in this period' for an activity without events in the period", () => {
    const sections = buildOutcomeReport(attendees, records, config({ activityTops: { "Writing Hood": 3 } }));
    expect(section(sections, "Top 3 — Writing Hood")).toMatchObject({ rows: [], notice: "No events in this period" });
  });

  it("breaks ties by events attended, then alphabetically", () => {
    // All at 80%: Abe 4 of 5; Ann, Max and Zoe 8 of 10 → the 8/10s first (alphabetical among them), Abe last
    const ten = days(1, 10);
    const people = ["Zoe", "Abe", "Max", "Ann"].map(person);
    const clean = [
      ...attends("Zoe", "Music Room", ten, 8), // 80% (8 of 10)
      ...attends("Abe", "Writing Hood", ten.slice(0, 5), 4), // 80% (4 of 5)
      ...attends("Max", "Speakeasy", ten, 8),
      ...attends("Ann", "Speakeasy", ten, 8),
    ];
    const overall = section(buildOutcomeReport(people, clean, config({ overallTop: 4 })), "Top 4 — Overall");
    expect(overall.rows.map(r => `${r.name} ${formatAttendance(r)}`)).toEqual([
      "Ann 80% (8 of 10 events)",
      "Max 80% (8 of 10 events)",
      "Zoe 80% (8 of 10 events)",
      "Abe 80% (4 of 5 events)",
    ]);
  });
});

describe("buildOutcomeReport — Top overall (US-40)", () => {
  const speak = days(1, 4);
  const music = days(10, 2);
  const attendees = ["Ana", "Bea", "Cid", "Nod"].map(person);
  const records = [
    ...attends("Ana", "Speakeasy", speak, 4),
    ...attends("Ana", "Music Room", music, 0), // absences don't enroll Ana in Music Room
    ...attends("Bea", "Speakeasy", speak, 1),
    ...attends("Bea", "Music Room", music, 2),
    ...attends("Cid", "Speakeasy", speak, 2),
  ];

  it("ranks by Overall with 'All activities' and the analogous fewer-than-N notice", () => {
    const s = section(buildOutcomeReport(attendees, records, config({ overallTop: 10 })), "Top 10 — Overall");
    expect(s.rows.map(r => [r.position, r.name, r.activity, formatAttendance(r)])).toEqual([
      [1, "Ana", "All activities", "100% (4 of 4 events)"],
      [2, "Bea", "All activities", "50% (3 of 6 events)"],
      [3, "Cid", "All activities", "50% (2 of 4 events)"],
    ]);
    expect(s.notice).toBe("Only 3 colleagues attended any activity in this period");
  });

  it("matches the Bee-havior Hub Overall for the same period", () => {
    const period = { start: D(2), end: D(10) };
    const s = section(buildOutcomeReport(attendees, records, config({ period, overallTop: 3 })), "Top 3 — Overall");
    const hub = computeBeehavior(attendees, records, period);
    for (const row of s.rows) {
      const h = hub.find(r => r.attendee.name === row.name)!;
      expect([row.rate, row.presents, row.total]).toEqual([h.overallRate, h.overallPresents, h.overallTotal]);
    }
  });
});

describe("buildOutcomeReport — Hive Status (US-40)", () => {
  const speak = days(1, 4);
  const attendees = ["Ana", "Bea", "Cid", "Dot", "Nod"].map(person);
  const records = [
    ...attends("Ana", "Speakeasy", speak, 4), // 100% Busy Bee
    ...attends("Bea", "Speakeasy", speak, 3), // 75% in May (60% all time): Forager
    ...attends("Cid", "Speakeasy", speak, 4).map(r => ({ ...r, activity: "Reading Club" })), // Reading Club 100%
    rec("Dot", "Speakeasy", "2026-01-01"), // enrolled before the period, attends nothing in it
    rec("Nod", "Speakeasy", D(1), "absent"), // never present → No data
  ];

  it("lists every colleague of a tier sorted by percentage", () => {
    const sections = buildOutcomeReport(attendees, records, config({ tiers: ["Busy Bee"] }));
    const s = section(sections, "Hive Status — Busy Bee");
    // All time: Dot's Jan 1 present adds a 5th Speakeasy event → Ana 80%; Bea (60%) is a Forager
    expect(s.rows.map(r => [r.name, r.activity, formatAttendance(r)])).toEqual([
      ["Cid", "All activities", "100% (4 of 4 events)"],
      ["Ana", "All activities", "80% (4 of 5 events)"],
    ]);
    expect(s.rows.every(r => r.position === undefined)).toBe(true);
  });

  it("shows an enrolled colleague with no attendance in the period as Dormant 0%, and leaves No data out", () => {
    const period = { start: D(1), end: D(31) };
    const s = section(
      buildOutcomeReport(attendees, records, config({ period, tiers: ["Dormant"] })),
      "Hive Status — Dormant"
    );
    expect(s.rows.map(r => [r.name, formatAttendance(r)])).toEqual([["Dot", "0% (0 of 4 events)"]]);
    expect(names(s)).not.toContain("Nod");
  });

  it("keeps No data colleagues out of every block, and notes an empty tier", () => {
    const sections = buildOutcomeReport(
      attendees,
      records,
      config({ overallTop: 10, activityTops: { Speakeasy: 10 }, tiers: ["Busy Bee", "Forager", "Hatcher", "Dormant"] })
    );
    for (const s of sections) expect(names(s)).not.toContain("Nod");
    expect(section(sections, "Hive Status — Hatcher")).toMatchObject({ rows: [], notice: "No Hatcher colleagues in this period" });
    expect(sections.filter(s => s.kind === "tier").map(s => s.title)).toEqual([
      "Hive Status — Busy Bee",
      "Hive Status — Forager",
      "Hive Status — Hatcher",
      "Hive Status — Dormant",
    ]);
  });
});

describe("Outcome Report helpers (US-40)", () => {
  it("parses N: integers 0–50, empty → 0, anything else invalid", () => {
    expect(parseTopN("")).toBe(0);
    expect(parseTopN(" 5 ")).toBe(5);
    expect(parseTopN("50")).toBe(50);
    expect(parseTopN("51")).toBeNull();
    expect(parseTopN("-1")).toBeNull();
    expect(parseTopN("2.5")).toBeNull();
    expect(parseTopN("abc")).toBeNull();
    // QA NIC-41: typos a number input would have turned into "" (→ 0) must stay invalid
    expect(parseTopN("5e")).toBeNull();
    expect(parseTopN("e")).toBeNull();
    expect(parseTopN("-")).toBeNull();
  });

  it("needs a ranking above 0 or a tier to have a block", () => {
    expect(hasReportBlock(config())).toBe(false);
    expect(hasReportBlock(config({ activityTops: { Speakeasy: 0 }, overallTop: 0 }))).toBe(false);
    expect(hasReportBlock(config({ activityTops: { Speakeasy: 1 } }))).toBe(true);
    expect(hasReportBlock(config({ overallTop: 1 }))).toBe(true);
    expect(hasReportBlock(config({ tiers: ["Dormant"] }))).toBe(true);
  });

  it("names the file after the period", () => {
    expect(reportFilename({ start: "2026-10-06", end: "2026-11-20" })).toBe(
      "honeycomb-outcome-report_2026-10-06_2026-11-20.txt"
    );
    expect(reportFilename(null)).toBe("honeycomb-outcome-report_all-time.txt");
  });

  it("uses the singular for one event", () => {
    expect(formatAttendance({ rate: 100, presents: 1, total: 1 })).toBe("100% (1 of 1 event)");
  });

  it("describes the chosen criteria in activity/tier order", () => {
    expect(
      describeCriteria(
        config({ activityTops: { "Reading Club": 2, Speakeasy: 5 }, overallTop: 3, tiers: ["Dormant", "Busy Bee"] })
      )
    ).toEqual(["Top per activity: Speakeasy 5, Reading Club 2", "Top overall: 3", "Hive Status: Busy Bee, Dormant"]);
  });
});

describe("formatOutcomeReport (US-40)", () => {
  const speak = ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04"];
  const read = ["2026-10-08", "2026-10-22"];
  const attendees = ["Ana Pérez", "Bo Li", "Carolina Martínez", "Dot"].map(person);
  const records = [
    ...attends("Ana Pérez", "Speakeasy", speak, 4),
    ...attends("Bo Li", "Speakeasy", speak, 5),
    ...attends("Carolina Martínez", "Speakeasy", speak, 2),
    ...attends("Carolina Martínez", "Reading Club", read, 2),
    rec("Dot", "Speakeasy", "2026-01-01"),
  ];
  const cfg = config({
    period: { start: "2026-10-06", end: "2026-11-20" },
    activityTops: { Speakeasy: 5, "Reading Club": 2, "Writing Hood": 3 },
    overallTop: 2,
    tiers: ["Busy Bee", "Dormant"],
  });
  const text = formatOutcomeReport(
    buildOutcomeReport(attendees, records, cfg),
    cfg,
    new Date(2026, 9, 9, 14, 5)
  );

  it("renders the expected report", () => {
    expect(text).toMatchInlineSnapshot(`
      "The Honeycomb — Outcome Report
      ============================================================
      Period:     Oct 6 – Nov 20, 2026
      Generated:  2026-10-09 14:05
      Criteria:
        - Top per activity: Speakeasy 5, Reading Club 2, Writing Hood 3
        - Top overall: 2
        - Hive Status: Busy Bee, Dormant

      ============================================================
      TOP 5 — SPEAKEASY
      ============================================================
      #  Name               Activity   Attendance
      1  Bo Li              Speakeasy  100% (5 of 5 events)
      2  Ana Pérez          Speakeasy  80% (4 of 5 events)
      3  Carolina Martínez  Speakeasy  40% (2 of 5 events)

      Only 3 colleagues attended Speakeasy in this period

      ============================================================
      TOP 2 — READING CLUB
      ============================================================
      #  Name               Activity      Attendance
      1  Carolina Martínez  Reading Club  100% (2 of 2 events)

      Only 1 colleague attended Reading Club in this period

      ============================================================
      TOP 3 — WRITING HOOD
      ============================================================
      No events in this period

      ============================================================
      TOP 2 — OVERALL
      ============================================================
      #  Name       Activity        Attendance
      1  Bo Li      All activities  100% (5 of 5 events)
      2  Ana Pérez  All activities  80% (4 of 5 events)

      ============================================================
      HIVE STATUS — BUSY BEE
      ============================================================
      Name       Activity        Attendance
      Bo Li      All activities  100% (5 of 5 events)
      Ana Pérez  All activities  80% (4 of 5 events)

      ============================================================
      HIVE STATUS — DORMANT
      ============================================================
      Name  Activity        Attendance
      Dot   All activities  0% (0 of 5 events)
      "
    `);
  });

  it("aligns every column of a table with spaces", () => {
    const lines = text.split("\n");
    const start = lines.indexOf("TOP 5 — SPEAKEASY") + 2;
    const [header, ...rows] = lines.slice(start, start + 4);
    for (const row of rows) {
      expect(row.indexOf("Speakeasy")).toBe(header.indexOf("Activity"));
      expect(row.search(/\d+% \(/)).toBe(header.indexOf("Attendance"));
    }
    expect(text.split("\n").every(l => l === l.trimEnd())).toBe(true);
  });

  it("says All time in the header for an All time report", () => {
    const c = config({ tiers: ["Busy Bee"] });
    expect(formatOutcomeReport([], c, new Date(2026, 0, 2, 3, 4))).toContain("Period:     All time\nGenerated:  2026-01-02 03:04");
  });
});
