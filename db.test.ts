import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

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

    await expect(db.importParsedData([attendee], records)).rejects.toThrow();
    const after = await db.getState();
    expect(after.attendees).toEqual([]);
    expect(after.records).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
    process.env.NODE_ENV = nodeEnv;
  });
});
