import path from "path";
import type { JSONFilePreset as JSONFilePresetType } from "lowdb/node";
import { Attendee, AttendanceRecord } from "./src/types";
import { initialAttendees, initialAttendanceRecords } from "./src/mockData";
import { isInvalidName } from "./src/utils";

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

async function getDb(): Promise<LowDbInstance> {
  if (!dbPromise) {
    // lowdb is ESM-only. A static `import` gets converted to `require()` by esbuild's
    // CJS output, which fails inside Electron's bundled (older) Node runtime with
    // ERR_REQUIRE_ESM (a plain `node dist/server.cjs` on a newer standalone Node happens
    // to support require(esm) and masks this — Electron's runtime doesn't). A dynamic
    // `import()` works from a CJS module on both, so we load it lazily here instead.
    dbPromise = import("lowdb/node").then(({ JSONFilePreset }) => JSONFilePreset<HoneycombData>(getDbPath(), DEFAULT_DATA)).then(async db => {
      const isEmpty =
        db.data.attendees.length === 0 &&
        db.data.records.length === 0 &&
        Object.keys(db.data.notes).length === 0;

      if (isEmpty) {
        db.data = seedData();
        await db.write();
      }

      return db;
    });
  }
  return dbPromise;
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
  db.data.records = [...filtered, ...newRecordsToSave];
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
  db.data.attendees = [...db.data.attendees, ...newAttendees];
  db.data.records = [...db.data.records, ...newRecordsToSave];
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
