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
  // null → the table shows "—" (not enrolled, or the activity has no events in the active period)
  rate: number | null;
}

export interface BeehaviorRow {
  attendee: Attendee;
  activityStats: ActivityStat[];
  overallRate: number | null;
  overallPresents: number;
  overallTotal: number;
  // null only with an active period and no event to rate the colleague on → the table shows "—"
  tier: HiveTier | null;
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

// An event is each unique activity + date with at least one record in the DB, whatever its source
// and status. Shared by the Bee-havior Hub (US-24) and the Activities Matrix Profile cards (US-29).
export function getEventDates(records: AttendanceRecord[]): Record<string, Set<string>> {
  const eventDates: Record<string, Set<string>> = {};
  for (const r of records) (eventDates[r.activity] ??= new Set()).add(r.date);
  return eventDates;
}

// US-43: the activities each colleague participates in — at least one `present` in them (an
// `absent`-only activity doesn't count), in ACTIVITIES order. The one definition of "participating"
// shared by the Overlap Cross-Referencer and the Dashboard; pass period-filtered records for a period.
export function getAttendedActivities(attendees: Attendee[], records: AttendanceRecord[]): Record<string, string[]> {
  const attended = new Set<string>();
  for (const r of records) if (r.status === "present") attended.add(`${r.attendeeId}|${r.activity}`);
  return Object.fromEntries(
    attendees.map(att => [att.id, ACTIVITIES.filter(activity => attended.has(`${att.id}|${activity}`))])
  );
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

// US-35: inclusive date range (ISO `YYYY-MM-DD`) the Dashboard metrics are restricted to.
// null → All time. A view only: it never touches stored records.
export interface DatePeriod {
  start: string;
  end: string;
}

// A usable range has both ends and the start isn't after the end
export const isValidPeriod = (start: string, end: string) => Boolean(start && end && start <= end);

// What the Dashboard selector holds (lifted to App so it survives tab changes, not reloads)
export interface PeriodFilter {
  mode: "all" | "custom";
  start: string;
  end: string;
}

export const ALL_TIME: PeriodFilter = { mode: "all", start: "", end: "" };

// The range to apply: null (All time) unless "Custom range" has a complete, ordered pair of dates
export function resolvePeriod(filter: PeriodFilter): DatePeriod | null {
  return filter.mode === "custom" && isValidPeriod(filter.start, filter.end)
    ? { start: filter.start, end: filter.end }
    : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Jun 1 – Jun 30, 2026" (the year goes on both ends when the range spans two years).
// Parsed by hand from the ISO string so the user's timezone can't shift the day.
export function formatPeriodLabel(period: DatePeriod): string {
  const part = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return { y, text: `${MONTHS[m - 1]} ${d}` };
  };
  const s = part(period.start);
  const e = part(period.end);
  return s.y === e.y ? `${s.text} – ${e.text}, ${e.y}` : `${s.text}, ${s.y} – ${e.text}, ${e.y}`;
}

// ISO dates sort lexicographically, so plain string comparison is enough
export function filterRecordsByPeriod(records: AttendanceRecord[], period: DatePeriod | null): AttendanceRecord[] {
  if (!period) return records;
  return records.filter(r => r.date >= period.start && r.date <= period.end);
}

// Absence is deduced from the events a colleague missed — no `absent` rows are created.
// US-31: the denominator is every event of the activity, the same for all enrolled colleagues —
// joinedDate and the date of their first present don't trim it, so a late starter isn't inflated.
// US-35: with a `period`, events and presents are counted inside it, but enrollment (≥1 present on
// any date) is not — an enrolled colleague who missed every event of the period shows 0%, and an
// activity with no events in the period shows "—" for everyone and stays out of Overall.
export function computeBeehavior(
  attendees: Attendee[],
  records: AttendanceRecord[],
  period: DatePeriod | null = null
): BeehaviorRow[] {
  const periodRecords = filterRecordsByPeriod(records, period);
  const eventDates = getEventDates(periodRecords);
  const enrolledIn = new Set<string>(); // `${attendeeId}|${activity}`, whatever the date
  const presentDates: Record<string, Set<string>> = {}; // `${attendeeId}|${activity}` → dates attended in the period

  for (const r of records) {
    if (r.status === "present") enrolledIn.add(`${r.attendeeId}|${r.activity}`);
  }
  for (const r of periodRecords) {
    if (r.status === "present") {
      (presentDates[`${r.attendeeId}|${r.activity}`] ??= new Set()).add(r.date);
    }
  }

  return [...attendees]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(att => {
      const activityStats: ActivityStat[] = ACTIVITIES.map(activity => {
        if (!enrolledIn.has(`${att.id}|${activity}`)) {
          return { activity, enrolled: false, presents: 0, total: 0, rate: null };
        }

        const presents = presentDates[`${att.id}|${activity}`]?.size ?? 0;
        const total = eventDates[activity]?.size ?? 0; // ≥ presents: every attended date is one of its events
        return { activity, enrolled: true, presents, total, rate: total ? percent(presents, total) : null };
      });

      const overallPresents = activityStats.reduce((sum, s) => sum + s.presents, 0);
      const overallTotal = activityStats.reduce((sum, s) => sum + s.total, 0);
      const overallRate = overallTotal ? percent(overallPresents, overallTotal) : null;
      // Activities attended in the period (all time: same as enrolled, since an enrolling present counts).
      // Keeps Multi-Activity in step with the Inter-Activity Hub KPI, which also counts presences in the period.
      const participatedCount = activityStats.filter(s => s.presents > 0).length;

      return {
        attendee: att,
        activityStats,
        overallRate,
        overallPresents,
        overallTotal,
        // With a period, no events in it → no rate → no tier ("—"), not a misleading Dormant.
        // All time keeps the US-24 behavior: a colleague without any rate is Dormant.
        tier: overallRate === null && period ? null : getHiveTier(overallRate ?? 0),
        isMulti: participatedCount > 1,
        participatedCount,
      };
    });
}
