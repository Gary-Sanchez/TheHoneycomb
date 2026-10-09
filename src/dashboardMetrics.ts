import { Attendee, AttendanceRecord, ACTIVITIES } from "./types";
import {
  BeehaviorRow,
  DatePeriod,
  computeBeehavior,
  filterRecordsByPeriod,
  getActivityEventStats,
  getEventDates,
  getHiveTier,
} from "./beehavior";

// US-45 / US-36: Dashboard metrics built on the Bee-havior Hub's event-based maths (beehavior.ts),
// so every rate here matches the Hub for the same period. Pure on purpose, like beehavior.ts.

const mean = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

// Colleagues with an Overall — the No data ones (US-44: no events to rate them on) are left out
const ratedRows = (rows: BeehaviorRow[]) => rows.filter(r => r.overallRate !== null);

export interface OverallAverage {
  // null → nobody has an Overall in the period → the KPI shows "—"
  rate: number | null;
  colleagues: number;
}

// US-45: Avg. Attendance Rate = plain average of the Hub's Overall column (not weighted by events)
export function averageOverall(rows: BeehaviorRow[]): OverallAverage {
  const rated = ratedRows(rows);
  return { rate: mean(rated.map(r => r.overallRate as number)), colleagues: rated.length };
}

// "Average of 24 colleagues" / "Average of 1 colleague"
export const formatAverageBase = (colleagues: number) =>
  `Average of ${colleagues} ${colleagues === 1 ? "colleague" : "colleagues"}`;

// ---- Attendance Trends -------------------------------------------------------------------------

export type TrendGrouping = "month" | "week";

export interface TrendPoint {
  key: string;
  label: string;
  start: string;
  end: string;
  events: number;
  // null → no events in the interval → shown as "No data", never as 0
  avgAttendees: number | null;
  rate: number | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;

// ISO `YYYY-MM-DD` ↔ UTC milliseconds, so the user's timezone can't shift a day
const toMs = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const clamp = (start: string, end: string, period: DatePeriod | null): DatePeriod => ({
  start: period && period.start > start ? period.start : start,
  end: period && period.end < end ? period.end : end,
});

// Every month/week from the first to the last record of the period — no fixed dates. Gaps in between
// are kept (with no events) so a month without events reads as "No data" instead of disappearing.
function buildIntervals(dates: string[], grouping: TrendGrouping, period: DatePeriod | null): DatePeriod[] {
  if (!dates.length) return [];
  const first = dates.reduce((a, b) => (a < b ? a : b));
  const last = dates.reduce((a, b) => (a > b ? a : b));
  const intervals: DatePeriod[] = [];

  if (grouping === "month") {
    let [y, m] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    while (y < ly || (y === ly && m <= lm)) {
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = toIso(Date.UTC(y, m, 0)); // day 0 of the next month = last day of this one
      intervals.push(clamp(start, end, period));
      m === 12 ? ((y += 1), (m = 1)) : (m += 1);
    }
  } else {
    const firstMs = toMs(first);
    let monday = firstMs - ((new Date(firstMs).getUTCDay() + 6) % 7) * DAY; // weeks start on Monday
    while (monday <= toMs(last)) {
      intervals.push(clamp(toIso(monday), toIso(monday + 6 * DAY), period));
      monday += 7 * DAY;
    }
  }
  return intervals;
}

const intervalLabel = (interval: DatePeriod, grouping: TrendGrouping) => {
  const [y, m, d] = interval.start.split("-").map(Number);
  return grouping === "month" ? `${MONTHS[m - 1]} ${y}` : `Week of ${MONTHS[m - 1]} ${d}`;
};

// Per interval: events held, present attendees per event, and the event-based rate — the average
// Overall of the colleagues with data in that interval (same definition as the KPI, US-45).
export function computeAttendanceTrends(
  attendees: Attendee[],
  allRecords: AttendanceRecord[],
  period: DatePeriod | null,
  grouping: TrendGrouping
): TrendPoint[] {
  const periodRecords = filterRecordsByPeriod(allRecords, period);
  return buildIntervals(periodRecords.map(r => r.date), grouping, period).map(interval => {
    const records = filterRecordsByPeriod(periodRecords, interval);
    const events = Object.values(getEventDates(records)).reduce((sum, dates) => sum + dates.size, 0);
    const presents = new Set(
      records.filter(r => r.status === "present").map(r => `${r.attendeeId}|${r.activity}|${r.date}`)
    ).size;
    return {
      key: interval.start,
      label: intervalLabel(interval, grouping),
      start: interval.start,
      end: interval.end,
      events,
      avgAttendees: events ? presents / events : null,
      rate: events ? averageOverall(computeBeehavior(attendees, allRecords, interval)).rate : null,
    };
  });
}

// ---- Cross-Activity Comparisons ----------------------------------------------------------------

export interface ActivityComparison {
  activity: string;
  events: number;
  avgAttendees: number | null;
  // Distinct colleagues with at least one present in the activity during the period
  uniqueAttendees: number;
  // Average of the Hub's cell for this activity among enrolled colleagues; null → no events
  avgRate: number | null;
}

// `rows` = computeBeehavior(attendees, allRecords, period), the same rows the Hub renders
export function computeActivityComparison(
  rows: BeehaviorRow[],
  allRecords: AttendanceRecord[],
  period: DatePeriod | null
): ActivityComparison[] {
  const records = filterRecordsByPeriod(allRecords, period);
  return ACTIVITIES.map(activity => {
    const { events, avgPresent } = getActivityEventStats(records, activity);
    const uniqueAttendees = new Set(
      records.filter(r => r.activity === activity && r.status === "present").map(r => r.attendeeId)
    ).size;
    const rates = rows
      .map(r => r.activityStats.find(s => s.activity === activity)?.rate)
      .filter((rate): rate is number => rate !== null && rate !== undefined);
    return { activity, events, avgAttendees: avgPresent, uniqueAttendees, avgRate: mean(rates) };
  });
}

// ---- Engagement ---------------------------------------------------------------------------------

export const HIVE_TIER_ORDER = ["Dormant", "Hatcher", "Forager", "Busy Bee"] as const;

export interface EngagementSummary {
  tiers: { label: (typeof HIVE_TIER_ORDER)[number]; count: number }[];
  // Colleagues without an Overall in the period (No data) — not in any tier
  noData: number;
  // Colleagues whose first-ever present in the activity falls inside the period
  newByActivity: { activity: string; count: number }[];
  newColleagues: number;
}

export function computeEngagement(
  rows: BeehaviorRow[],
  allRecords: AttendanceRecord[],
  period: DatePeriod | null
): EngagementSummary {
  const rated = ratedRows(rows);
  const tiers = HIVE_TIER_ORDER.map(label => ({
    label,
    count: rated.filter(r => getHiveTier(r.overallRate as number).label === label).length,
  }));

  const known = new Set(rows.map(r => r.attendee.id));
  const firstPresent: Record<string, string> = {}; // `${attendeeId}|${activity}` → earliest present date
  for (const r of allRecords) {
    if (r.status !== "present" || !known.has(r.attendeeId)) continue;
    const key = `${r.attendeeId}|${r.activity}`;
    if (!firstPresent[key] || r.date < firstPresent[key]) firstPresent[key] = r.date;
  }
  const inPeriod = (date: string) => !period || (date >= period.start && date <= period.end);
  const newKeys = Object.entries(firstPresent).filter(([, date]) => inPeriod(date)).map(([key]) => key);

  return {
    tiers,
    noData: rows.length - rated.length,
    newByActivity: ACTIVITIES.map(activity => ({
      activity,
      count: newKeys.filter(key => key.endsWith(`|${activity}`)).length,
    })),
    newColleagues: new Set(newKeys.map(key => key.split("|")[0])).size,
  };
}
