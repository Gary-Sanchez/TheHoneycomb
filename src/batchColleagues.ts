import type { Attendee, ParsedRecord } from "./types";
import { isBlacklistedName } from "./blacklist";

// US-66: which colleagues of an import batch are new and which are already in the directory. Shared
// by the summary bar of Import Forage Logs and handleImportApproved (DocumentParser), so the counts
// the user reviews are exactly the colleagues the import creates.
//   - existing = the row's matched attendee, or a directory name equal to it (case-insensitive);
//     counted once per attendee
//   - new = everyone else, deduplicated by name (trimmed, case-insensitive); the first record of
//     each name is kept (its activity becomes the new colleague's enrolled activity)
//   - blacklisted facilitators (US-19) are never counted nor created

/** Id of the directory colleague this record belongs to, if any. */
export function existingAttendeeId(rec: ParsedRecord, attendees: Attendee[]): string | undefined {
  if (rec.matchedAttendeeId) return rec.matchedAttendeeId;
  const name = rec.name.trim().toLowerCase();
  return attendees.find(a => a.name.toLowerCase() === name)?.id;
}

export interface BatchColleagues {
  /** First record of each new colleague, in batch order, keyed by lowercased trimmed name. */
  newColleagues: Map<string, ParsedRecord>;
  /** Ids of the directory colleagues the batch logs. */
  existingColleagueIds: Set<string>;
}

export function batchColleagues(records: ParsedRecord[], attendees: Attendee[]): BatchColleagues {
  const newColleagues = new Map<string, ParsedRecord>();
  const existingColleagueIds = new Set<string>();
  for (const rec of records) {
    if (isBlacklistedName(rec.name)) continue;
    const id = existingAttendeeId(rec, attendees);
    if (id) {
      existingColleagueIds.add(id);
      continue;
    }
    const key = rec.name.trim().toLowerCase();
    if (!newColleagues.has(key)) newColleagues.set(key, rec);
  }
  return { newColleagues, existingColleagueIds };
}
