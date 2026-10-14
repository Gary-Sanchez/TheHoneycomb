import { describe, expect, it } from "vitest";
import { findSameEventFileIds } from "./sameEvent";
import type { ParsedRecord } from "./types";

const rec = (fileId: number, activity: string, date = "2026-06-24"): ParsedRecord => ({
  name: "Ana", activity, date, status: "present", fileId,
});

describe("findSameEventFileIds", () => {
  it("flags files with same date and activity", () => {
    const rs = [rec(0, "Music Room"), rec(1, "Music Room")];
    expect(findSameEventFileIds(rs, 0, [0, 1])).toEqual([1]);
  });
  it("does not flag same date with different activities", () => {
    const rs = [rec(0, "Music Room"), rec(1, "Reading Club")];
    expect(findSameEventFileIds(rs, 0, [0, 1])).toEqual([]);
  });
  it("recalculates when a manual activity change makes files match", () => {
    const rs = [rec(0, "Music Room"), rec(1, "Reading Club")];
    expect(findSameEventFileIds(rs, 0, [0, 1])).toEqual([]);
    const changed = rs.map(r => (r.fileId === 1 ? { ...r, activity: "Music Room" } : r));
    expect(findSameEventFileIds(changed, 0, [0, 1])).toEqual([1]);
  });
});
