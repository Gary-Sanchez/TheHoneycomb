import path from "path";
import type { JSONFilePreset as JSONFilePresetType } from "lowdb/node";
import { Attendee, AttendanceRecord } from "./src/types";
import { initialAttendees, initialAttendanceRecords } from "./src/mockData";
import { isInvalidName, nameKey } from "./src/utils";
import { isBlacklistedName } from "./src/blacklist";

interface HoneycombData {
  attendees: Attendee[];
  records: AttendanceRecord[];
  notes: Record<string, string>;
}

const DEFAULT_DATA: HoneycombData = {
  attendees: [],
  records: [],
  notes: {},
};

function seedData(): HoneycombData {
  const filteredAttendees = initialAttendees.filter(att => !isInvalidName(att.name));
  const validAttendeeIds = new Set(filteredAttendees.map(att => att.id));
  const filteredRecords = initialAttendanceRecords.filter(
    rec => !isInvalidName(rec.attendeeName) && validAttendeeIds.has(rec.attendeeId)
  );

  return {
    attendees: filteredAttendees,
    records: filteredRecords,
    notes: {},
  };
}

function getDbPath(): string {
  return process.env.HONEYCOMB_DB_PATH || path.join(process.cwd(), "honeycomb-data.json");
}

type LowDbInstance = Awaited<ReturnType<typeof JSONFilePresetType<HoneycombData>>>;

let dbPromise: Promise<LowDbInstance> | null = null;

// Writes started but not yet settled; flush() awaits these before the process exits (US-15).
const pendingWrites = new Set<Promise<unknown>>();

async function getDb(): Promise<LowDbInstance> {
  if (!dbPromise) {
    // lowdb is ESM-only. A static `import` gets converted to `require()` by esbuild's
    // CJS output, which fails inside Electron's bundled (older) Node runtime with
    // ERR_REQUIRE_ESM (a plain `node dist/server.cjs` on a newer standalone Node happens
    // to support require(esm) and masks this — Electron's runtime doesn't). A dynamic
    // `import()` works from a CJS module on both, so we load it lazily here instead.
    // No auto-seed on empty data: a fresh install (or a real database the user emptied
    // out) must start/stay empty. Demo data only loads on an explicit Reset Demo Seed
    // (resetToSeed below) — see US-04.
    dbPromise = import("lowdb/node")
      .then(({ JSONFilePreset }) => JSONFilePreset<HoneycombData>(getDbPath(), DEFAULT_DATA))
      .then(db => {
        // Track every write so flush() can wait for in-flight ones without touching each mutation.
        const originalWrite = db.write.bind(db);
        db.write = () => {
          const p = originalWrite();
          pendingWrites.add(p);
          const untrack = () => pendingWrites.delete(p);
          p.then(untrack, untrack);
          return p;
        };
        return db;
      });
  }
  return dbPromise;
}

// Resolves once every write started so far has settled (no-op when nothing is pending).
// Loops because a write can be started while we're awaiting the previous batch.
export async function flush(): Promise<void> {
  while (pendingWrites.size > 0) {
    await Promise.allSettled([...pendingWrites]);
  }
}

export async function getState(): Promise<HoneycombData> {
  const db = await getDb();
  return db.data;
}

// Mirrors handleAddAttendee (src/App.tsx) — the attendee is fully constructed
// client-side (including its id) so the UI can update optimistically; this just persists it.
export async function addAttendee(attendee: Attendee): Promise<HoneycombData> {
  const db = await getDb();
  db.data.attendees.push(attendee);
  await db.write();
  return db.data;
}

// Mirrors handleUpdateEnrollment (src/App.tsx)
export async function updateEnrollment(attendeeId: string, activities: string[]): Promise<HoneycombData> {
  const db = await getDb();
  db.data.attendees = db.data.attendees.map(att =>
    att.id === attendeeId ? { ...att, enrolledActivities: activities } : att
  );
  await db.write();
  return db.data;
}

// Mirrors handleRemoveAttendee (src/App.tsx) — cascades to records and notes
export async function removeAttendee(attendeeId: string): Promise<HoneycombData> {
  const db = await getDb();
  db.data.attendees = db.data.attendees.filter(att => att.id !== attendeeId);
  db.data.records = db.data.records.filter(rec => rec.attendeeId !== attendeeId);
  delete db.data.notes[attendeeId];
  await db.write();
  return db.data;
}

// Mirrors handleSaveRecords (src/App.tsx) — records already carry client-generated ids;
// replaces any existing records matching the same date+activity to avoid duplicate logs.
export async function saveRecords(newRecordsToSave: AttendanceRecord[]): Promise<HoneycombData> {
  const db = await getDb();
  if (newRecordsToSave.length === 0) return db.data;

  const { date, activity } = newRecordsToSave[0];
  const filtered = db.data.records.filter(r => !(r.date === date && r.activity === activity));
  // US-20: one record per colleague per session, even if the payload repeats someone
  const uniqueByAttendee = [...new Map(newRecordsToSave.map(r => [r.attendeeId, r])).values()];
  db.data.records = [...filtered, ...uniqueByAttendee];
  await db.write();
  return db.data;
}

// Mirrors handleManualCheckIn (src/App.tsx) — US-20. A session is the set of records sharing
// date+activity (same shape a .csv import produces), so checking someone in upserts their record
// by attendeeId+date+activity: it joins the existing session or starts it, never duplicating it.
// US-23: the client may be a stale window that doesn't know the colleague yet and sends a "new"
// attendee with its own id. The server's directory decides: a colleague whose name matches
// (nameKey — case/whitespace-insensitive) is reused, and the record is re-pointed to them.
export async function manualCheckIn(
  newAttendee: Attendee | null,
  record: AttendanceRecord
): Promise<HoneycombData> {
  const db = await getDb();
  const incomingName = newAttendee?.name ?? record.attendeeName;
  const attendee =
    db.data.attendees.find(att => att.id === record.attendeeId) ??
    db.data.attendees.find(att => nameKey(att.name) === nameKey(incomingName));

  let attendeeId = record.attendeeId;
  let attendeeName = record.attendeeName;
  if (attendee) {
    attendeeId = attendee.id;
    attendeeName = attendee.name;
  } else if (newAttendee) {
    db.data.attendees.push(newAttendee);
  }

  const existing = db.data.records.find(
    r => r.attendeeId === attendeeId && r.date === record.date && r.activity === record.activity
  );
  if (existing) {
    existing.status = record.status;
  } else {
    db.data.records.push({ ...record, attendeeId, attendeeName });
  }
  await db.write();
  return db.data;
}

// Mirrors handleImportParsedData (src/App.tsx) — attendees/records are already fully
// formed and linked client-side (ids assigned, attendeeId matched by name); this appends them.
export async function importParsedData(
  newAttendees: Attendee[],
  newRecordsToSave: AttendanceRecord[]
): Promise<HoneycombData> {
  const db = await getDb();
  // US-19: server-side guard so blacklisted facilitators never reach consolidated data
  db.data.attendees = [...db.data.attendees, ...newAttendees.filter(att => !isBlacklistedName(att.name))];
  db.data.records = [...db.data.records, ...newRecordsToSave.filter(rec => !isBlacklistedName(rec.attendeeName))];
  await db.write();
  return db.data;
}

// Mirrors handleSaveNotes (src/App.tsx)
export async function saveNote(attendeeId: string, text: string): Promise<HoneycombData> {
  const db = await getDb();
  db.data.notes = { ...db.data.notes, [attendeeId]: text };
  await db.write();
  return db.data;
}

// Mirrors handleResetDatabase (src/App.tsx)
export async function resetToSeed(): Promise<HoneycombData> {
  const db = await getDb();
  db.data = seedData();
  await db.write();
  return db.data;
}
