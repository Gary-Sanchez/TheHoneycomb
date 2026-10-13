import { describe, expect, it } from "vitest";
import { computeBeehavior, getMonthlyRates } from "./beehavior";
import type { AttendanceRecord, Attendee } from "./types";

// US-41: numbers the Progress Report modal shows (it reuses computeBeehavior + getMonthlyRates)

const attendee = (id: string): Attendee => ({ id, name: id, enrolledActivities: [], joinedDate: "2026-01-01" });

let seq = 0;
const rec = (
  attendeeId: string,
  activity: string,
  date: string,
  status: "present" | "absent" = "present"
): AttendanceRecord => ({ id: `r${seq++}`, attendeeId, attendeeName: attendeeId, activity, date, status });

const D = (n: number) => `2026-05-${String(n).padStart(2, "0")}`;

describe("Progress Report numbers (US-41)", () => {
  it("QA: 1/8 Speakeasy + 2/4 Writing Hood → Overall 25%, Speakeasy 13%, Writing Hood 50%, others —", () => {
    const records = [
      // 8 Speakeasy events defined by "other"; "ana" attends only the first
      ...Array.from({ length: 8 }, (_, i) => rec("other", "Speakeasy", D(i + 1))),
      rec("ana", "Speakeasy", D(1)),
      // 4 Writing Hood events; "ana" attends two of them
      ...Array.from({ length: 4 }, (_, i) => rec("other", "Writing Hood", D(i + 10))),
      rec("ana", "Writing Hood", D(10)),
      rec("ana", "Writing Hood", D(11)),
      // Reading Club exists but "ana" never attended it
      rec("other", "Reading Club", D(20)),
    ];
    const ana = attendee("ana");
    // Only the colleague's row is passed, as the modal does; totals still come from every record
    const [row] = computeBeehavior([ana], records, null);
    const byActivity = Object.fromEntries(row.activityStats.map(s => [s.activity, s]));

    expect(row.overallRate).toBe(25); // 3 / 12
    expect(byActivity["Speakeasy"]).toMatchObject({ presents: 1, total: 8, rate: 13 });
    expect(byActivity["Writing Hood"]).toMatchObject({ presents: 2, total: 4, rate: 50 });
    expect(byActivity["Reading Club"].rate).toBeNull();
    expect(byActivity["Music Room"].rate).toBeNull();

    // Same value as their row in the full Bee-havior Hub (All time)
    const hub = computeBeehavior([ana, attendee("other")], records, null).find(r => r.attendee.id === "ana")!;
    expect(hub.overallRate).toBe(row.overallRate);
  });

  it("a colleague with no present record has no Overall (—)", () => {
    const [row] = computeBeehavior([attendee("ana")], [rec("other", "Speakeasy", D(1))], null);
    expect(row.overallRate).toBeNull();
  });
});

describe("getMonthlyRates (US-41)", () => {
  it("QA: records Jan–Jun 2026 → 6 months, chronological, no year in the label", () => {
    const records = [6, 1, 3, 2, 5, 4].map(m => rec("ana", "Speakeasy", `2026-0${m}-10`));
    const months = getMonthlyRates(attendee("ana"), records);
    expect(months.map(m => m.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
    expect(months.every(m => m.rate === 100)).toBe(true);
  });

  it("rates each month by its events: a month where the colleague missed every event shows 0%", () => {
    const records = [
      rec("other", "Speakeasy", "2026-03-03"),
      rec("other", "Speakeasy", "2026-03-10"),
      rec("ana", "Speakeasy", "2026-03-10"),
      rec("other", "Speakeasy", "2026-04-07"), // ana has no record in April
    ];
    expect(getMonthlyRates(attendee("ana"), records)).toEqual([
      { month: "2026-03", label: "Mar", rate: 50 },
      { month: "2026-04", label: "Apr", rate: 0 },
    ]);
  });

  it("leaves out months with no event in the colleague's activities", () => {
    const records = [rec("ana", "Speakeasy", "2026-03-10"), rec("other", "Music Room", "2026-04-07")];
    expect(getMonthlyRates(attendee("ana"), records).map(m => m.month)).toEqual(["2026-03"]);
  });

  it("adds the year to the label when the months span more than one year", () => {
    const records = [rec("ana", "Speakeasy", "2026-01-05"), rec("ana", "Speakeasy", "2025-12-15")];
    expect(getMonthlyRates(attendee("ana"), records).map(m => m.label)).toEqual(["Dec 2025", "Jan 2026"]);
  });

  it("no rated month → empty (the chart shows its empty state)", () => {
    expect(getMonthlyRates(attendee("ana"), [])).toEqual([]);
  });
});
