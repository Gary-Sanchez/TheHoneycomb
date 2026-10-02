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

// US-26: when a .csv was imported, as "YYYY-MM-DD HH:mm" (local time). Shared by the server's
// 409 message and the Doc Parser so both say the same thing.
export function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// US-26: the message shown when a .csv is blocked as a duplicate of an earlier import
export function duplicateImportMessage(previous: { filename: string; importedAt: string }): string {
  return `Duplicate file: this .csv was already imported as "${previous.filename}" on ${formatImportedAt(previous.importedAt)}. The import was blocked and no records were created.`;
}
