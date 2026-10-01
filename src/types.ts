export interface Attendee {
  id: string;
  name: string;
  email?: string;
  enrolledActivities: string[]; // Names of activities they participate in
  joinedDate: string; // YYYY-MM-DD
}

export interface AttendanceRecord {
  id: string;
  attendeeId: string;
  attendeeName: string;
  activity: string;
  date: string; // YYYY-MM-DD
  status: "present" | "absent";
}

export interface ParsedRecord {
  name: string;
  activity: string;
  date: string;
  status: "present" | "absent";
  matchedAttendeeId?: string; // If we matched it to an existing attendee
  fileId?: number; // US-27: index of the batch file this record came from
  needsReview?: boolean; // US-25: duration unreadable, kept but flagged
  reviewReason?: string;
}

// US-25: an attendee dropped from a .csv for attending less than 10 minutes
export interface DurationExclusion {
  name: string;
  duration: string; // e.g. "9m 59s"
  seconds: number;
}

// US-27: per-file summary of a .csv batch, shown as a group in Review Extracted Records
export interface ParsedFileGroup {
  id: number;
  filename: string;
  dateDetected: boolean;
  durationFilterApplied: boolean;
  excludedByDuration: DurationExclusion[];
  excludedByBlacklist: number;
  duplicateOf: string | null; // filename of the identical earlier file in the batch
}

// Outcome of a manual check-in into a date+activity session (US-20)
export interface ManualCheckInResult {
  attendee: Attendee;
  isNew: boolean; // colleague was just created in the directory
  joinedExistingSession: boolean; // the date+activity session already had records
  alreadyInSession: boolean; // this colleague was already logged in that session
}

// Response of GET /api/auth/status (US-11)
export interface AuthStatus {
  authenticated: boolean;
  adminConfigured: boolean;
  setupAllowed: boolean; // no admin password yet AND request came from localhost
}

export const ACTIVITIES = [
  "Speakeasy",
  "Reading Club",
  "Music Room",
  "Writing Hood",
] as const;

export type ActivityType = typeof ACTIVITIES[number];
