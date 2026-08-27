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

export const ACTIVITIES = [
  "Speakeasy",
  "Reading Club",
  "Music Room",
  "Writing Hood",
] as const;

export type ActivityType = typeof ACTIVITIES[number];
