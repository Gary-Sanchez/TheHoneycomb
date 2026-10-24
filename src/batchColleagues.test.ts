import { describe, expect, it } from "vitest";
import { batchColleagues, existingAttendeeId } from "./batchColleagues";
import type { Attendee, ParsedRecord } from "./types";

const attendees: Attendee[] = [{ id: "a1", name: "Elena Rostova", enrolledActivities: ["Speakeasy"], joinedDate: "2026-01-01" } as Attendee];
const rec = (name: string, extra: Partial<ParsedRecord> = {}): ParsedRecord => ({
  name,
  activity: "Speakeasy",
  date: "2026-06-24",
  status: "present",
  ...extra,
});

describe("US-66: batchColleagues (summary bar = what the import creates)", () => {
  it("existing = matched or same name in the directory (case-insensitive), counted once", () => {
    expect(existingAttendeeId(rec("elena rostova "), attendees)).toBe("a1");
    expect(existingAttendeeId(rec("Someone", { matchedAttendeeId: "x" }), attendees)).toBe("x");
    const { existingColleagueIds, newColleagues } = batchColleagues(
      [rec("Elena Rostova", { matchedAttendeeId: "a1" }), rec("ELENA ROSTOVA", { activity: "Music Room" })],
      attendees
    );
    expect([...existingColleagueIds]).toEqual(["a1"]);
    expect(newColleagues.size).toBe(0);
  });

  it("new colleagues are deduplicated by name and keep their first record", () => {
    const { newColleagues } = batchColleagues(
      [rec("Maria Lopez"), rec("maria lopez", { activity: "Music Room" }), rec("Carlos Gomez")],
      attendees
    );
    expect([...newColleagues.keys()]).toEqual(["maria lopez", "carlos gomez"]);
    expect(newColleagues.get("maria lopez")?.activity).toBe("Speakeasy");
  });
});
