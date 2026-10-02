import { describe, expect, it } from "vitest";
import { formatAvgAttendees, getActivityEventStats } from "./beehavior";
import type { AttendanceRecord } from "./types";

let seq = 0;
const rec = (
  attendeeId: string,
  activity: string,
  date: string,
  status: "present" | "absent" = "present"
): AttendanceRecord => ({ id: `r${seq++}`, attendeeId, attendeeName: attendeeId, activity, date, status });

// One event of `activity` on `date` with `n` present colleagues (ids p0..pn-1)
const event = (activity: string, date: string, n: number) =>
  Array.from({ length: n }, (_, i) => rec(`p${i}`, activity, date));

const stats = (records: AttendanceRecord[], activity: string) => {
  const s = getActivityEventStats(records, activity);
  return { events: s.events, avg: formatAvgAttendees(s.avgPresent) };
};

const speakeasy = [
  ...event("Speakeasy", "2026-06-03", 6),
  ...event("Speakeasy", "2026-06-10", 8),
  ...event("Speakeasy", "2026-06-17", 7),
  ...event("Speakeasy", "2026-06-24", 9),
];

describe("getActivityEventStats (US-29)", () => {
  it("QA-01: 4 Speakeasy events with 6, 8, 7, 9 present → 4 events, avg 7.5", () => {
    expect(stats(speakeasy, "Speakeasy")).toEqual({ events: 4, avg: "7.5" });
  });

  it("QA-02: an activity with no events → 0 events and —", () => {
    expect(stats(speakeasy, "Writing Hood")).toEqual({ events: 0, avg: "—" });
    expect(getActivityEventStats(speakeasy, "Writing Hood").avgPresent).toBeNull();
  });

  it("QA-03: a new 10-attendee event → 5 events, avg 8.0", () => {
    const records = [...speakeasy, ...event("Speakeasy", "2026-07-01", 10)];
    expect(stats(records, "Speakeasy")).toEqual({ events: 5, avg: "8.0" });
  });

  it("QA-04: two check-ins of the same Music Room date → one event with 2 attendees", () => {
    const records = [rec("ana", "Music Room", "2026-06-12"), rec("luis", "Music Room", "2026-06-12")];
    expect(stats(records, "Music Room")).toEqual({ events: 1, avg: "2.0" });
  });

  it("QA-05: absents don't count toward the average, and an absence-only event still counts (US-24)", () => {
    const records = [...event("Reading Club", "2026-06-05", 5), rec("ausente", "Reading Club", "2026-06-05", "absent")];
    expect(stats(records, "Reading Club")).toEqual({ events: 1, avg: "5.0" });

    const withAbsenceOnly = [...records, rec("ausente", "Reading Club", "2026-06-19", "absent")];
    expect(stats(withAbsenceOnly, "Reading Club")).toEqual({ events: 2, avg: "2.5" });
  });

  it("QA-06: deleting a colleague recalculates; an event they were the sole attendee of stops counting", () => {
    const records = [
      rec("ana", "Reading Club", "2026-06-05"),
      rec("luis", "Reading Club", "2026-06-05"),
      rec("ana", "Reading Club", "2026-06-19"), // ana alone
    ];
    expect(stats(records, "Reading Club")).toEqual({ events: 2, avg: "1.5" });

    // removeAttendee cascades: ana's records are gone
    const afterDelete = records.filter(r => r.attendeeId !== "ana");
    expect(stats(afterDelete, "Reading Club")).toEqual({ events: 1, avg: "1.0" });
  });

  it("QA-07: after a reset (no records) every activity shows 0 events and —", () => {
    for (const activity of ["Speakeasy", "Reading Club", "Music Room", "Writing Hood"]) {
      expect(stats([], activity)).toEqual({ events: 0, avg: "—" });
    }
  });

  it("counts a colleague once per event even with duplicate present rows", () => {
    const records = [rec("ana", "Speakeasy", "2026-06-03"), rec("ana", "Speakeasy", "2026-06-03")];
    expect(stats(records, "Speakeasy")).toEqual({ events: 1, avg: "1.0" });
  });

  it("isn't date-filtered: events far from the reference date still count", () => {
    const records = [rec("ana", "Music Room", "2025-01-10"), rec("ana", "Music Room", "2026-12-04")];
    expect(stats(records, "Music Room")).toEqual({ events: 2, avg: "1.0" });
  });
});
