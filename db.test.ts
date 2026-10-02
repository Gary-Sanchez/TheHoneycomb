import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { findPreviousImport } from "./db";
import type { ImportFingerprint } from "./src/types";

// US-27 QA-08: a batch import is all-or-nothing. When lowdb's write fails, nothing from the batch may
// remain, not even in memory.
describe("importParsedData atomicity (US-27)", () => {
  it("rolls the whole batch back when the write fails", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "honeycomb-db-"));
    process.env.HONEYCOMB_DB_PATH = path.join(dir, "data.json");
    // lowdb's JSONFilePreset uses an in-memory adapter under NODE_ENV=test (set by Vitest); the
    // real file adapter is needed for the write to actually fail.
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const db = await import("./db");

    const before = await db.getState();
    expect(before.records).toEqual([]);
    // lowdb writes to ".data.json.tmp" first: a directory in its place makes the write fail (EISDIR)
    fs.mkdirSync(path.join(dir, ".data.json.tmp"));

    const attendee = { id: "att-1", name: "Ana Lopez", enrolledActivities: ["Music Room"], joinedDate: "2026-06-10" };
    const records = ["2026-06-10", "2026-06-17"].map((date, i) => ({
      id: `log-${i}`, attendeeId: "att-1", attendeeName: "Ana Lopez", activity: "Music Room", date, status: "present" as const,
    }));
    const fingerprint = {
      hash: "a".repeat(64), filename: "music.csv", activity: "Music Room", date: "2026-06-10", attendeeCount: 1, attendeeNames: ["Ana Lopez"],
    };

    await expect(db.importParsedData([attendee], records, [fingerprint])).rejects.toThrow();
    const after = await db.getState();
    expect(after.attendees).toEqual([]);
    expect(after.records).toEqual([]);
    expect(after.imports).toEqual([]); // US-26: no fingerprint for an import that wasn't saved
    fs.rmSync(dir, { recursive: true, force: true });
    process.env.NODE_ENV = nodeEnv;
  });
});

// US-26: what counts as a .csv that was already imported
describe("findPreviousImport (US-26)", () => {
  const stored: ImportFingerprint[] = [{
    hash: "1".repeat(64),
    filename: "speakeasy-june-10.csv",
    activity: "Speakeasy",
    date: "2026-06-10",
    attendeeCount: 2,
    attendeeNames: ["Ana Lopez", "Bruno Diaz"],
    importedAt: "2026-10-02T14:30:00.000Z",
  }];
  const original = { filename: "speakeasy-june-10.csv", importedAt: "2026-10-02T14:30:00.000Z" };

  it("matches the same content even under another filename or without a date (QA-01/02)", () => {
    expect(findPreviousImport(stored, { hash: "1".repeat(64), activity: "Speakeasy", date: "", attendeeNames: [] })).toEqual(original);
  });

  it("matches a re-export: other bytes, same activity, date and attendees in any order/case (QA-03)", () => {
    const candidate = { hash: "2".repeat(64), activity: "Speakeasy", date: "2026-06-10", attendeeNames: ["BRUNO  DIAZ", "ana lopez"] };
    expect(findPreviousImport(stored, candidate)).toEqual(original);
  });

  it("does not match the same event with other attendees, another date or another activity (QA-04)", () => {
    const base = { hash: "2".repeat(64), activity: "Speakeasy", date: "2026-06-10", attendeeNames: ["Ana Lopez", "Bruno Diaz"] };
    expect(findPreviousImport(stored, { ...base, attendeeNames: [...base.attendeeNames, "Carla Nueva", "Dario Ruiz"] })).toBeNull();
    expect(findPreviousImport(stored, { ...base, date: "2026-06-17" })).toBeNull();
    expect(findPreviousImport(stored, { ...base, activity: "Music Room" })).toBeNull();
  });
});

// US-26: fingerprints are saved with the import, a duplicate is refused without touching anything,
// a file joining an existing event only adds its new colleagues, and a reset clears the history.
describe("importParsedData fingerprints (US-26)", () => {
  it("blocks duplicates, merges new attendees into the event, and is cleared by a reset", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "honeycomb-db-"));
    process.env.HONEYCOMB_DB_PATH = path.join(dir, "data.json");
    const { vi } = await import("vitest");
    vi.resetModules();
    const db = await import("./db"); // fresh module → empty in-memory database

    const person = (n: number) => ({ id: `att-${n}`, name: `Person ${n}`, enrolledActivities: ["Speakeasy"], joinedDate: "2026-06-10" });
    const log = (n: number, id = `log-${n}`) => ({
      id, attendeeId: `att-${n}`, attendeeName: `Person ${n}`, activity: "Speakeasy", date: "2026-06-10", status: "present" as const,
    });
    const fp = (hash: string, names: string[], filename = "first.csv") => ({
      hash: hash.repeat(64), filename, activity: "Speakeasy", date: "2026-06-10", attendeeCount: names.length, attendeeNames: names,
    });

    const first = await db.importParsedData([person(1), person(2)], [log(1), log(2)], [fp("a", ["Person 1", "Person 2"])]);
    expect(first.imports).toHaveLength(1);
    expect(first.imports[0]).toMatchObject({ hash: "a".repeat(64), filename: "first.csv", attendeeCount: 2 });
    expect(Date.parse(first.imports[0].importedAt)).not.toBeNaN();

    // QA-01/02/03/05: same hash (renamed) or re-export → refused, nothing changes
    const snapshot = JSON.stringify(await db.getState());
    await expect(db.importParsedData([], [log(1, "x1"), log(2, "x2")], [fp("a", ["Person 1", "Person 2"], "renamed.csv")]))
      .rejects.toBeInstanceOf(db.DuplicateImportError);
    await expect(db.importParsedData([], [log(1, "x1"), log(2, "x2")], [fp("b", ["Person 2", "Person 1"], "reexport.csv")]))
      .rejects.toMatchObject({ previous: { filename: "first.csv" } });
    expect(JSON.stringify(await db.getState())).toBe(snapshot);

    // QA-04: same event, 2 new attendees → only the 2 new are added
    const merged = await db.importParsedData(
      [person(3), person(4)],
      [log(1, "y1"), log(2, "y2"), log(3), log(4)],
      [fp("c", ["Person 1", "Person 2", "Person 3", "Person 4"], "second.csv")]
    );
    const event = merged.records.filter(r => r.date === "2026-06-10" && r.activity === "Speakeasy");
    expect(event.map(r => r.attendeeId).sort()).toEqual(["att-1", "att-2", "att-3", "att-4"]);
    expect(merged.imports).toHaveLength(2);

    // QA-06: a reset clears the fingerprints, so the same file imports again
    const reset = await db.resetToSeed();
    expect(reset.imports).toEqual([]);
    await expect(db.importParsedData([], [], [fp("a", ["Person 1", "Person 2"])])).resolves.toBeTruthy();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// US-33: a .csv is also compared against the records, so an event loaded without a fingerprint
// (Manual Check-In, an import before US-26) is recognized too
describe("findLoadedEvent (US-33)", () => {
  const attendees = [
    { id: "att-1", name: "Ana Lopez", enrolledActivities: ["Speakeasy"], joinedDate: "2026-06-10" },
    { id: "att-2", name: "Bruno Diaz", enrolledActivities: ["Speakeasy"], joinedDate: "2026-06-10" },
  ];
  const rec = (n: number, status: "present" | "absent" = "present") => ({
    id: `log-${n}`, attendeeId: `att-${n}`, attendeeName: attendees[n - 1].name, activity: "Speakeasy", date: "2026-06-10", status,
  });
  const candidate = (names: string[], status: "present" | "absent" = "present", date = "2026-06-10") => ({
    activity: "Speakeasy", date, attendees: names.map(name => ({ name, status })),
  });
  const event = { activity: "Speakeasy", date: "2026-06-10" };

  it("matches when every attendee is already in the event, in any case/spacing (QA-01)", async () => {
    const { findLoadedEvent } = await import("./db");
    expect(findLoadedEvent([rec(1), rec(2)], attendees, candidate(["ANA  LOPEZ", "bruno diaz"]))).toEqual(event);
    // A subset of the event adds nothing either
    expect(findLoadedEvent([rec(1), rec(2)], attendees, candidate(["Ana Lopez"]))).toEqual(event);
  });

  it("does not match a file that adds someone, another date/activity, or no date yet (QA-04)", async () => {
    const { findLoadedEvent } = await import("./db");
    const records = [rec(1), rec(2)];
    expect(findLoadedEvent(records, attendees, candidate(["Ana Lopez", "Bruno Diaz", "Carla Nueva"]))).toBeNull();
    expect(findLoadedEvent(records, attendees, candidate(["Ana Lopez"], "present", "2026-06-17"))).toBeNull();
    expect(findLoadedEvent(records, attendees, { ...candidate(["Ana Lopez"]), activity: "Music Room" })).toBeNull();
    expect(findLoadedEvent(records, attendees, candidate(["Ana Lopez"], "present", ""))).toBeNull();
    expect(findLoadedEvent(records, attendees, candidate([]))).toBeNull();
  });

  it("does not match when the file turns someone from absent to present (QA-03)", async () => {
    const { findLoadedEvent } = await import("./db");
    expect(findLoadedEvent([rec(1), rec(2, "absent")], attendees, candidate(["Ana Lopez", "Bruno Diaz"]))).toBeNull();
    // ...but an absent in the file over a present record changes nothing
    expect(findLoadedEvent([rec(1), rec(2)], attendees, candidate(["Ana Lopez", "Bruno Diaz"], "absent"))).toEqual(event);
  });

  it("uses the directory name behind attendeeId, not a stale name on the record", async () => {
    const { findLoadedEvent } = await import("./db");
    const stale = { ...rec(1), attendeeName: "Ana" };
    expect(findLoadedEvent([stale], attendees, candidate(["Ana Lopez"]))).toEqual(event);
  });
});

// US-33: the import route re-checks against the records (the date may have been picked in the
// preview), and an import that changes nothing leaves no fingerprint
describe("importParsedData against existing records (US-33)", () => {
  it("refuses a .csv whose event is complete, allows absent→present, and skips no-op fingerprints", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "honeycomb-db-"));
    process.env.HONEYCOMB_DB_PATH = path.join(dir, "data.json");
    const { vi } = await import("vitest");
    vi.resetModules();
    const db = await import("./db");

    const ana = { id: "att-1", name: "Ana Lopez", enrolledActivities: ["Speakeasy"], joinedDate: "2026-06-10" };
    const bruno = { id: "att-2", name: "Bruno Diaz", enrolledActivities: ["Speakeasy"], joinedDate: "2026-06-10" };
    const log = (att: typeof ana, status: "present" | "absent", id: string) => ({
      id, attendeeId: att.id, attendeeName: att.name, activity: "Speakeasy", date: "2026-06-10", status,
    });
    const fp = (hash: string, names: string[]) => ({
      hash: hash.repeat(64), filename: `${hash}.csv`, activity: "Speakeasy", date: "2026-06-10", attendeeCount: names.length, attendeeNames: names,
    });

    // The event comes from Manual Check-In: no fingerprint
    await db.manualCheckIn(ana, log(ana, "present", "m1"));
    await db.manualCheckIn(bruno, log(bruno, "absent", "m2"));

    // QA-03: Bruno absent → present is a real change, so the file goes in with its fingerprint
    const upgraded = await db.importParsedData([], [log(ana, "present", "i1"), log(bruno, "present", "i2")], [fp("a", ["Ana Lopez", "Bruno Diaz"])]);
    expect(upgraded.records.find(r => r.id === "m2")?.status).toBe("present");
    expect(upgraded.records).toHaveLength(2);
    expect(upgraded.imports).toHaveLength(1);

    // QA-01/02: another export of the same complete event → 409-style refusal, nothing changes
    const snapshot = JSON.stringify(await db.getState());
    await expect(db.importParsedData([], [log(ana, "present", "j1")], [fp("b", ["Ana Lopez"])]))
      .rejects.toMatchObject({ event: { activity: "Speakeasy", date: "2026-06-10" }, filename: "b.csv" });
    await expect(db.importParsedData([], [log(ana, "present", "j1")], [fp("b", ["Ana Lopez"])]))
      .rejects.toBeInstanceOf(db.EventAlreadyLoadedError);
    expect(JSON.stringify(await db.getState())).toBe(snapshot);

    // An import with no fingerprint (not a .csv) that changes nothing leaves no fingerprint either
    const noop = await db.importParsedData([], [log(ana, "present", "k1")], []);
    expect(noop.records).toHaveLength(2);
    expect(noop.imports).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
