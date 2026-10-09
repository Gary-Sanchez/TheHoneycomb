import { Attendee, AttendanceRecord, ACTIVITIES } from "./types";

// US-24: Caserits Bee-havior Hub maths. Pure on purpose (no React) so it can be unit-tested.

export interface HiveTier {
  label: string;
  color: string;
  bgLight: string;
  textColor: string;
  icon: string;
  meaning: string;
}

export interface ActivityStat {
  activity: string;
  // At least one `present` record in this activity (absence-only logs don't enroll)
  enrolled: boolean;
  // Events (activity + date) the colleague attended / all recorded events of the activity (US-31)
  presents: number;
  total: number;
  // null → the table shows "—" (not enrolled)
  rate: number | null;
}

export interface BeehaviorRow {
  attendee: Attendee;
  activityStats: ActivityStat[];
  overallRate: number | null;
  overallPresents: number;
  overallTotal: number;
  tier: HiveTier;
  isMulti: boolean;
  participatedCount: number;
}

const percent = (presents: number, total: number) => Math.round((presents / total) * 100);

export function getHiveTier(rate: number): HiveTier {
  if (rate >= 76) {
    return {
      label: "Busy Bee",
      color: "#D4AF37", // Metallic/Golden Yellow for contrast
      bgLight: "#FFFDF0", // Light Bright Golden Yellow tint
      textColor: "#7A5E00",
      icon: "🐝",
      meaning: "Queen's favorite. Elite attendance and top-tier dedication.",
    };
  }
  if (rate >= 51) {
    return {
      label: "Forager",
      color: "#E68A00", // Rich Warm Orange for contrast
      bgLight: "#FFF7E6", // Light warm orange tint
      textColor: "#804C00",
      icon: "🌸",
      meaning: "Honey maker. Solid presence, regularly contributing to the buzz.",
    };
  }
  if (rate >= 26) {
    return {
      label: "Hatcher",
      color: "#B89F30", // Darker gold/amber to ensure contrast on off-white or yellow backgrounds
      bgLight: "#FEFBEA", // Light Pale Amber tint
      textColor: "#6B5800",
      icon: "🥚",
      meaning: "Getting cozy. Halfway to becoming a regular flyer.",
    };
  }
  return {
    label: "Dormant",
    color: "#2F4F4F", // Charcoal
    bgLight: "#E6ECEC", // Light charcoal tint
    textColor: "#2F4F4F",
    icon: "💤",
    meaning: "Hibernating. Rare sightings. Still getting to know the honeycomb.",
  };
}

// US-44: no events to rate the colleague on (not enrolled anywhere, or their activities had no
// events) is not the same as attending none of them — grey, no tier color, no icon.
export const NO_DATA_TIER: HiveTier = {
  label: "No data",
  color: "#6B7280",
  bgLight: "#F3F4F6",
  textColor: "#6B7280",
  icon: "",
  meaning: "No events to rate this colleague on yet.",
};

// Hive Status for an Overall rate; null (no Overall) → No data, never Dormant. Every view showing
// the Hive Status must go through this, not getHiveTier(rate ?? 0).
export const getHiveStatus = (rate: number | null): HiveTier => (rate === null ? NO_DATA_TIER : getHiveTier(rate));

// Colleagues with an Overall. No data ones stay out of tier rankings/reports (Outcome Report, US-40)
// and averages (Avg. Attendance Rate KPI, US-45).
export const hasHiveData = (row: BeehaviorRow): boolean => row.overallRate !== null;

// An event is each unique activity + date with at least one record in the DB, whatever its source
// and status. Shared by the Bee-havior Hub (US-24) and the Activities Matrix Profile cards (US-29).
export function getEventDates(records: AttendanceRecord[]): Record<string, Set<string>> {
  const eventDates: Record<string, Set<string>> = {};
  for (const r of records) (eventDates[r.activity] ??= new Set()).add(r.date);
  return eventDates;
}

export interface ActivityEventStats {
  events: number;
  // Present attendees per event; null → the card shows "—" (no events)
  avgPresent: number | null;
}

// US-29: registered events of an activity and its average attendees per event (presents ÷ events).
// Not date-filtered. A colleague is counted once per event even if they have duplicate present rows.
export function getActivityEventStats(records: AttendanceRecord[], activity: string): ActivityEventStats {
  const events = getEventDates(records)[activity]?.size ?? 0;
  const presents = new Set(
    records.filter(r => r.activity === activity && r.status === "present").map(r => `${r.attendeeId}|${r.date}`)
  ).size;
  return { events, avgPresent: events ? presents / events : null };
}

// One decimal ("7.5", "8.0"), or "—" when the activity has no events
export const formatAvgAttendees = (avg: number | null) => (avg === null ? "—" : avg.toFixed(1));

// Absence is deduced from the events a colleague missed — no `absent` rows are created.
// US-31: the denominator is every event of the activity, the same for all enrolled colleagues —
// joinedDate and the date of their first present don't trim it, so a late starter isn't inflated.
export function computeBeehavior(attendees: Attendee[], records: AttendanceRecord[]): BeehaviorRow[] {
  const eventDates = getEventDates(records);
  const presentDates: Record<string, Set<string>> = {}; // `${attendeeId}|${activity}` → dates attended

  for (const r of records) {
    if (r.status === "present") {
      (presentDates[`${r.attendeeId}|${r.activity}`] ??= new Set()).add(r.date);
    }
  }

  return [...attendees]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(att => {
      const activityStats: ActivityStat[] = ACTIVITIES.map(activity => {
        const attended = presentDates[`${att.id}|${activity}`];
        if (!attended) return { activity, enrolled: false, presents: 0, total: 0, rate: null };

        const presents = attended.size;
        const total = eventDates[activity].size; // ≥ presents: every attended date is one of its events
        return { activity, enrolled: true, presents, total, rate: percent(presents, total) };
      });

      const overallPresents = activityStats.reduce((sum, s) => sum + s.presents, 0);
      const overallTotal = activityStats.reduce((sum, s) => sum + s.total, 0);
      const overallRate = overallTotal ? percent(overallPresents, overallTotal) : null;
      const participatedCount = activityStats.filter(s => s.enrolled).length;

      return {
        attendee: att,
        activityStats,
        overallRate,
        overallPresents,
        overallTotal,
        tier: getHiveStatus(overallRate),
        isMulti: participatedCount > 1,
        participatedCount,
      };
    });
}
