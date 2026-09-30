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
