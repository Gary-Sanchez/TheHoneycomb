import fs from "fs";
import path from "path";
import type { JSONFilePreset as JSONFilePresetType } from "lowdb/node";
// US-50: the app version (= PRD number, US-49) the data file is stamped with. A JSON import works
// the same under tsx (dev), esbuild's dist/server.cjs (bundled in, so app.asar needs nothing extra)
// and Vitest.
import pkg from "./package.json" with { type: "json" };
import { Attendee, AttendanceRecord, ImportFingerprint, LoadedEvent, PreviousImport } from "./src/types";
import { initialAttendees, initialAttendanceRecords } from "./src/mockData";
import { isInvalidName, nameKey } from "./src/utils";
import { isBlacklistedName } from "./src/blacklist";

export interface HoneycombData {
  // US-50: file metadata, not app state. A file from before US-50 has neither until startup stamps
  // them (see openDb); after a failed backup they stay as the file had them, so the next start retries.
  schemaVersion: number;
  appVersion: string;
  attendees: Attendee[];
  records: AttendanceRecord[];
  notes: Record<string, string>;
  imports: ImportFingerprint[]; // US-26: one fingerprint per successfully imported .csv
}

// --- Data schema versions (US-50) ----------------------------------------------------------
// Bump CURRENT_SCHEMA_VERSION and append a migration whenever the shape of honeycomb-data.json
// changes. Migrations only go up (no down-migrations): rolling back = restoring a backup.
export const CURRENT_SCHEMA_VERSION = 2;
export const APP_VERSION: string = pkg.version;
// What a data file without appVersion (written before US-49/US-50) is named after in its backup
const UNKNOWN_APP_VERSION = "0.0.0";

interface Migration {
  from: number;
  to: number;
  migrate: (data: HoneycombData) => void;
}

export const MIGRATIONS: Migration[] = [
  // 1 → 2 formalizes the US-26 backfill: databases created before US-26 have no fingerprint history
  { from: 1, to: 2, migrate: data => { data.imports ??= []; } },
];

const defaultData = (): HoneycombData => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  appVersion: APP_VERSION,
  attendees: [],
  records: [],
  notes: {},
  imports: [],
});

// US-50: the data file was written by a newer app (schemaVersion > CURRENT_SCHEMA_VERSION), e.g.
// after rolling back to an older installer. The database stays locked: nothing reads or writes it.
export class NewerSchemaError extends Error {
  constructor(public readonly fileVersion: number, public readonly backups: string[]) {
    super(
      `The data file uses schema version ${fileVersion}, but this version of The Honeycomb (v${APP_VERSION}) ` +
      `supports up to ${CURRENT_SCHEMA_VERSION}. It was left untouched.`
    );
  }
}

// US-26: what a .csv being imported is compared against the stored fingerprints with
export interface ImportCandidate {
  hash: string;
  activity: string;
  date: string;
  attendeeNames: string[];
}

const attendeeSetKey = (names: string[]) => [...new Set(names.map(nameKey))].sort().join("|");

// US-26: the earlier import a .csv duplicates, or null. Duplicate = same content hash (whatever the
// filename), or same activity + event date + set of (already filtered) attendees. Without a date
// yet (the user still has to pick it) only the hash can match. The most recent match is reported.
export function findPreviousImport(imports: ImportFingerprint[], candidate: ImportCandidate): PreviousImport | null {
  const setKey = attendeeSetKey(candidate.attendeeNames);
  for (let i = imports.length - 1; i >= 0; i--) {
    const fp = imports[i];
    const sameContent = fp.hash === candidate.hash;
    const sameEvent =
      Boolean(candidate.date) &&
      candidate.attendeeNames.length > 0 &&
      fp.activity === candidate.activity &&
      fp.date === candidate.date &&
      attendeeSetKey(fp.attendeeNames) === setKey;
    if (sameContent || sameEvent) return { filename: fp.filename, importedAt: fp.importedAt };
  }
  return null;
}

// US-26: thrown by importParsedData when a .csv in the payload was already imported
export class DuplicateImportError extends Error {
  constructor(public readonly previous: PreviousImport, public readonly filename: string) {
    super(`${filename} was already imported as ${previous.filename}`);
  }
}

// A colleague's key within a date+activity event: the directory name behind attendeeId when known
// (the record's own name may be stale), else the record's name. Shared by the US-26 merge and US-33.
function eventKeyFor(attendees: Attendee[]) {
  const nameById = new Map(attendees.map(att => [att.id, nameKey(att.name)]));
  return (rec: Pick<AttendanceRecord, "attendeeId" | "attendeeName" | "date" | "activity">) =>
    `${nameById.get(rec.attendeeId) ?? nameKey(rec.attendeeName)}|${rec.date}|${rec.activity}`;
}

// US-33: what a .csv is compared against the existing records with
export interface EventCandidate {
  activity: string;
  date: string;
  attendees: { name: string; status: AttendanceRecord["status"] }[];
}

// US-33: the date+activity event a .csv adds nothing to, or null. That is the case when every
// (already filtered) attendee already has a record in that event — however it got there (Manual
// Check-In, Batch Check-In, an import from before US-26) — and the file turns nobody from absent
// to present. Without a date yet (the user still has to pick it) nothing can match.
export function findLoadedEvent(
  records: AttendanceRecord[],
  attendees: Attendee[],
  candidate: EventCandidate
): LoadedEvent | null {
  const { activity, date } = candidate;
  if (!activity || !date || candidate.attendees.length === 0) return null;
  const keyOf = eventKeyFor(attendees);
  const statusByKey = new Map(
    records.filter(rec => rec.date === date && rec.activity === activity).map(rec => [keyOf(rec), rec.status])
  );
  const addsNothing = candidate.attendees.every(att => {
    const existing = statusByKey.get(`${nameKey(att.name)}|${date}|${activity}`);
    return existing !== undefined && !(existing === "absent" && att.status === "present");
  });
  return addsNothing ? { activity, date } : null;
}

// US-33: thrown by importParsedData when a .csv in the payload adds nothing to its event
export class EventAlreadyLoadedError extends Error {
  constructor(public readonly event: LoadedEvent, public readonly filename: string) {
    super(`${filename} adds nothing to the ${event.activity} event on ${event.date}`);
  }
}

// Exported for e2e/fixtures/build-fixture.ts (US-50), which builds the regression DB from it.
export function seedData(): HoneycombData {
  const filteredAttendees = initialAttendees.filter(att => !isInvalidName(att.name));
  const validAttendeeIds = new Set(filteredAttendees.map(att => att.id));
  const filteredRecords = initialAttendanceRecords.filter(
    rec => !isInvalidName(rec.attendeeName) && validAttendeeIds.has(rec.attendeeId)
  );

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    attendees: filteredAttendees,
    records: filteredRecords,
    notes: {},
    imports: [], // US-26: a reset also clears the fingerprint history
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
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

// US-50: the data file as it is on disk, before lowdb opens it (null = no file yet). Read raw so a
// file from a newer app can be refused before lowdb gets a chance to write anything to it.
async function readDataFile(dbPath: string): Promise<Partial<HoneycombData> | null> {
  let text: string;
  try {
    text = await fs.promises.readFile(dbPath, "utf-8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object" ? parsed : {};
}

// "honeycomb-data.json" → "honeycomb-data": backups are named after the actual data file
function backupStem(dbPath: string): string {
  const base = path.basename(dbPath);
  return base.toLowerCase().endsWith(".json") ? base.slice(0, -".json".length) : base;
}

function localDateStamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// US-50: copies the data file to <stem>.backup-v{previousVersion}-{YYYY-MM-DD}.json next to it
// (real local date, not the app's fixed reference date), adding -2, -3… if that name is taken.
// COPYFILE_EXCL never overwrites an earlier backup. Returns the backup's path.
export async function backupDataFile(dbPath: string, previousVersion: string, now = new Date()): Promise<string> {
  const safeVersion = previousVersion.replace(/[^0-9A-Za-z.+-]/g, "_") || UNKNOWN_APP_VERSION;
  const prefix = path.join(path.dirname(dbPath), `${backupStem(dbPath)}.backup-v${safeVersion}-${localDateStamp(now)}`);
  for (let n = 1; ; n++) {
    const target = n === 1 ? `${prefix}.json` : `${prefix}-${n}.json`;
    try {
      await fs.promises.copyFile(dbPath, target, fs.constants.COPYFILE_EXCL);
      return target;
    } catch (err: any) {
      if (err?.code !== "EEXIST" || n >= 1000) throw err;
    }
  }
}

// US-50: the backups next to the data file, for the newer-schema error message
function listBackups(dbPath: string): string[] {
  const stem = `${backupStem(dbPath)}.backup-`.toLowerCase();
  try {
    return fs
      .readdirSync(path.dirname(dbPath))
      .filter(name => name.toLowerCase().startsWith(stem) && name.toLowerCase().endsWith(".json"))
      .sort()
      .map(name => path.join(path.dirname(dbPath), name));
  } catch {
    return [];
  }
}

// Opens the database and, at startup (US-50), brings the file up to this app's schema:
//  - no file yet → created with the current schemaVersion/appVersion, no backup;
//  - schemaVersion newer than CURRENT_SCHEMA_VERSION → nothing is written, the error is logged and
//    every db function rejects with NewerSchemaError (restore a backup or reinstall the newer app);
//  - a pending migration or another appVersion → the file is backed up first; only if the backup
//    succeeds are the migrations applied and the new versions saved, in one write. A failed backup
//    is logged and the data is used as it is (the next start tries again);
//  - no schemaVersion (file from before US-50) → treated as the current schema, just stamped.
async function openDb(): Promise<LowDbInstance> {
  const dbPath = getDbPath();
  const onDisk = await readDataFile(dbPath);
  const fileSchema = typeof onDisk?.schemaVersion === "number" ? onDisk.schemaVersion : undefined;

  if (fileSchema !== undefined && fileSchema > CURRENT_SCHEMA_VERSION) {
    const backups = listBackups(dbPath);
    console.error(
      `[ERROR] ${dbPath} uses data schema version ${fileSchema}, but this version of The Honeycomb ` +
      `(v${APP_VERSION}) only supports up to schema version ${CURRENT_SCHEMA_VERSION}. The file was NOT modified ` +
      "and the data stays unavailable. It was written by a newer version of the app (e.g. after a rollback): " +
      "install that version again, or close the app and replace the data file with the backup made before the upgrade. " +
      (backups.length > 0
        ? `Backups found:\n${backups.map(b => `  - ${b}`).join("\n")}`
        : `No backups (${backupStem(dbPath)}.backup-*.json) were found next to it.`)
    );
    throw new NewerSchemaError(fileSchema, backups);
  }

  // lowdb is ESM-only. A static `import` gets converted to `require()` by esbuild's
  // CJS output, which fails inside Electron's bundled (older) Node runtime with
  // ERR_REQUIRE_ESM (a plain `node dist/server.cjs` on a newer standalone Node happens
  // to support require(esm) and masks this — Electron's runtime doesn't). A dynamic
  // `import()` works from a CJS module on both, so we load it lazily here instead.
  // No auto-seed on empty data: a fresh install (or a real database the user emptied
  // out) must start/stay empty. Demo data only loads on an explicit Reset Demo Seed
  // (resetToSeed below) — see US-04.
  const { JSONFilePreset } = await import("lowdb/node");
  const db = await JSONFilePreset<HoneycombData>(dbPath, defaultData());
  // Track every write so flush() can wait for in-flight ones without touching each mutation.
  const originalWrite = db.write.bind(db);
  db.write = () => {
    const p = originalWrite();
    pendingWrites.add(p);
    const untrack = () => pendingWrites.delete(p);
    p.then(untrack, untrack);
    return p;
  };

  if (onDisk === null) {
    await db.write();
    console.log(`[Status] Created ${dbPath} (data schema v${CURRENT_SCHEMA_VERSION}, app v${APP_VERSION}).`);
  } else {
    const fromSchema = fileSchema ?? CURRENT_SCHEMA_VERSION;
    const pending: Migration[] = [];
    for (let v = fromSchema; v < CURRENT_SCHEMA_VERSION; ) {
      const step = MIGRATIONS.find(m => m.from === v);
      if (!step) throw new Error(`No migration from data schema version ${v}`);
      pending.push(step);
      v = step.to;
    }
    const previousApp = typeof onDisk.appVersion === "string" ? onDisk.appVersion : UNKNOWN_APP_VERSION;

    if (pending.length > 0 || previousApp !== APP_VERSION) {
      let backupPath: string | null = null;
      try {
        backupPath = await backupDataFile(dbPath, previousApp);
        console.log(`[Status] Backed up ${dbPath} to ${backupPath} before upgrading from app v${previousApp} to v${APP_VERSION}.`);
      } catch (err: any) {
        console.error(
          `[ERROR] Could not back up ${dbPath} before upgrading from app v${previousApp} to v${APP_VERSION} ` +
          `(${err?.message ?? err}). No migration was applied and the file was left as it is; ` +
          "the backup will be retried on the next start.",
        );
      }
      if (backupPath) {
        for (const step of pending) {
          step.migrate(db.data);
          console.log(`[Status] Migrated ${dbPath} from data schema v${step.from} to v${step.to}.`);
        }
        db.data.schemaVersion = CURRENT_SCHEMA_VERSION;
        db.data.appVersion = APP_VERSION;
        await db.write();
      }
    } else if (fileSchema === undefined) {
      db.data.schemaVersion = CURRENT_SCHEMA_VERSION;
      await db.write();
    }
  }

  // Defensive: databases created before US-26 have no fingerprint history yet (also covers a
  // migration skipped by a failed backup)
  db.data.imports ??= [];
  return db;
}

// US-50: opens the database at startup (server.ts startServer) so backups and migrations happen
// before the first request instead of lazily on it. Never throws: failures are logged, and every
// db function then rejects with the same error. Resolves to whether the database is usable.
export async function init(): Promise<boolean> {
  try {
    await getDb();
    return true;
  } catch (err) {
    // NewerSchemaError was already logged with the backups to restore
    if (!(err instanceof NewerSchemaError)) console.error(`[ERROR] Could not open the data file ${getDbPath()}:`, err);
    return false;
  }
}

// US-50: the reason the database can't be used (e.g. NewerSchemaError), or null when it can
export async function unavailableReason(): Promise<unknown> {
  try {
    await getDb();
    return null;
  } catch (err) {
    return err;
  }
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
// US-27: a whole .csv batch arrives in one call and is all-or-nothing — if the write fails, the
// in-memory state is rolled back too, so a later successful write can't persist half a batch.
// US-26: each imported .csv leaves a fingerprint, saved in the same write. A payload carrying a
// .csv that was already imported is rejected whole (DuplicateImportError) before anything changes.
// A file joining an existing date+activity event only adds the colleagues not already in it.
// US-33: a .csv whose event already holds all its colleagues is rejected too (EventAlreadyLoadedError),
// and an import that changes nothing leaves no fingerprint.
export async function importParsedData(
  newAttendees: Attendee[],
  newRecordsToSave: AttendanceRecord[],
  fingerprints: Omit<ImportFingerprint, "importedAt">[] = []
): Promise<HoneycombData> {
  const db = await getDb();
  const previous = db.data;

  for (const fp of fingerprints) {
    const match = findPreviousImport(previous.imports, fp);
    if (match) throw new DuplicateImportError(match, fp.filename);
  }

  // US-19: server-side guard so blacklisted facilitators never reach consolidated data
  const attendees = [...previous.attendees, ...newAttendees.filter(att => !isBlacklistedName(att.name))];
  const sessionKey = eventKeyFor(attendees);

  // US-33: the date may have been picked in the preview, so re-check each .csv against the records.
  // A fingerprint carries names only; their status is the one the (consolidated) payload sends.
  const statusByKey = new Map(newRecordsToSave.map(rec => [sessionKey(rec), rec.status]));
  for (const fp of fingerprints) {
    const loaded = findLoadedEvent(previous.records, attendees, {
      activity: fp.activity,
      date: fp.date,
      attendees: fp.attendeeNames.map(name => ({
        name,
        status: statusByKey.get(`${nameKey(name)}|${fp.date}|${fp.activity}`) ?? "present",
      })),
    });
    if (loaded) throw new EventAlreadyLoadedError(loaded, fp.filename);
  }

  const records = previous.records.map(rec => ({ ...rec }));
  const bySession = new Map(records.map(rec => [sessionKey(rec), rec]));
  let changed = false;
  for (const rec of newRecordsToSave) {
    if (isBlacklistedName(rec.attendeeName)) continue;
    const existing = bySession.get(sessionKey(rec));
    if (existing) {
      if (rec.status === "present" && existing.status !== "present") {
        existing.status = "present"; // "present" wins, like a batch
        changed = true;
      }
      continue;
    }
    records.push(rec);
    bySession.set(sessionKey(rec), rec);
    changed = true;
  }

  const importedAt = new Date().toISOString();
  db.data = {
    ...previous,
    attendees,
    records,
    // US-33: no fingerprint for an import that added nothing — it would vouch for a file never loaded
    imports: changed ? [...previous.imports, ...fingerprints.map(fp => ({ ...fp, importedAt }))] : previous.imports,
  };
  try {
    await db.write();
  } catch (err) {
    db.data = previous;
    throw err;
  }
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
  // US-50: the file's schemaVersion/appVersion are metadata, not demo data — keep them as they are
  const { schemaVersion, appVersion } = db.data;
  db.data = { ...seedData(), schemaVersion, appVersion };
  await db.write();
  return db.data;
}
