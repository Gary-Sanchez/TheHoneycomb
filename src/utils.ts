import { isBlacklistedName } from "./blacklist";

// System reference date (see CLAUDE.md) — dashboards, default session dates and new colleagues'
// joinedDate key off this, never the real current date.
export const REFERENCE_DATE = "2026-06-24";

export function isInvalidName(nameStr: string): boolean {
  if (!nameStr) return true;
  const normalizedLower = nameStr.toLowerCase().replace(/\s+/g, " ").trim();

  // 1. Length & basic validation
  if (normalizedLower.length <= 1) return true;
  
  // If it consists only of digits, punctuation, or times/durations (e.g. "12:30", "2026-06-12", "45", "100%", "30 min")
  if (/^[0-9:\-\/\s%apm\(\)]+$/i.test(normalizedLower)) {
    return true;
  }

  // 2. Filter out the US-19 ingestion blacklist (facilitators / coordination staff)
  if (isBlacklistedName(nameStr)) return true;

  // 3. Filter out metadata rows
  const METADATA_SUBSTRINGS = [
    "meeting title",
    "attended participants",
    "start time",
    "end time",
    "meeting duration",
    "average attendance time",
    "average attendance",
    "attendance rate",
    "duration",
    "participants",
    "attendance log",
    "attendance sheet",
    "log date",
    "activity name",
    "colleague name",
    "name (headers)",
    "name(headers)",
    "headers",
    "report",
    "details",
    "summary"
  ];

  for (const meta of METADATA_SUBSTRINGS) {
    if (normalizedLower === meta || normalizedLower.includes(meta)) {
      return true;
    }
  }

  // Headers containing "name" specifically
  if (
    normalizedLower === "name" || 
    normalizedLower === "name:" || 
    normalizedLower.startsWith("name ") || 
    normalizedLower.startsWith("name:") || 
    normalizedLower.includes("name (") || 
    normalizedLower.endsWith("(headers)") ||
    normalizedLower.includes("header")
  ) {
    return true;
  }

  return false;
}

// US-23: key used to recognize the same colleague by name — case-insensitive and ignoring
// leading/trailing/repeated whitespace ("  CARLA   Nueva " ≡ "Carla Nueva")
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// US-28: A→Z order for colleague names, ignoring case and accents ("Álvaro" ≡ "alvaro" < "Beatriz").
// Fixed locale so the order doesn't depend on the machine; names equal at base level fall back to
// a code-point comparison so the result is deterministic.
const nameCollator = new Intl.Collator("en", { sensitivity: "base" });

export function compareNames(a: string, b: string): number {
  return nameCollator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

// Returns a sorted copy — never mutates the input (stored order stays untouched)
export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareNames(a.name, b.name));
}

// US-46: "1 colleague" / "2 colleagues" — the one plural helper for on-screen counts
export const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// US-46: the one on-screen date format, "Jun 24, 2026". Takes an ISO date (YYYY-MM-DD, extra time
// part ignored) and parses it by hand so the user's timezone can't shift the day. Generated files
// and file names keep ISO. Anything unparseable is returned as is.
export function formatDisplayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  const month = MONTH_ABBR[Number(m) - 1];
  return month ? `${month} ${Number(d)}, ${y}` : iso;
}

// US-26: when a .csv was imported, as "Jun 24, 2026 at 14:05" (local time). Shared by the server's
// 409 message and the Doc Parser so both say the same thing.
export function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${formatDisplayDate(day)} at ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// US-26: the message shown when a .csv is blocked as a duplicate of an earlier import
export function duplicateImportMessage(previous: { filename: string; importedAt: string }): string {
  return `Duplicate file: this .csv was already imported as "${previous.filename}" on ${formatImportedAt(previous.importedAt)}. The import was blocked and no records were created.`;
}

// US-33: the message shown when a .csv is blocked because its event already holds all its colleagues
export function alreadyLoadedMessage(event: { activity: string; date: string }): string {
  return `Already loaded: every colleague in this .csv is already recorded in the ${event.activity} event on ${formatDisplayDate(event.date)}. The import was blocked and no records were created.`;
}
