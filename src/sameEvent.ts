import type { ParsedRecord } from "./types";

// US-37 (QA PR #39): files only merge into one event when they share date AND activity.
// Returns the ids of the other files that have a record with the same date+activity as a record of `fileId`.
// Records without an activity (not yet picked) never match, so no false merge warning.
export function findSameEventFileIds(records: ParsedRecord[], fileId: number, candidateIds: number[]): number[] {
  const keys = new Set(
    records.filter(r => r.fileId === fileId && r.date && r.activity).map(r => `${r.date}|${r.activity}`)
  );
  if (keys.size === 0) return [];
  return candidateIds.filter(
    id => id !== fileId && records.some(r => r.fileId === id && keys.has(`${r.date}|${r.activity}`))
  );
}
