import { Attendee, AttendanceRecord, ACTIVITIES } from "./types";
import {
  BeehaviorRow,
  DatePeriod,
  computeBeehavior,
  filterRecordsByPeriod,
  formatPeriodLabel,
  getEventDates,
  hasHiveData,
} from "./beehavior";

// US-40: Outcome Report. Pure on purpose (no React, no DOM) so it can be unit-tested; the rates
// come from computeBeehavior, so they match the Bee-havior Hub for the same period.

export const REPORT_TITLE = "The Honeycomb — Outcome Report";
export const NO_EVENTS_MESSAGE = "No events in this period";
export const ALL_ACTIVITIES = "All activities";
export const MAX_TOP_N = 50;

// Selectable Hive Status tiers, highest first (the order their sections appear in the report)
export const REPORT_TIERS = ["Busy Bee", "Forager", "Hatcher", "Dormant"] as const;
export type ReportTier = (typeof REPORT_TIERS)[number];

export interface OutcomeReportConfig {
  period: DatePeriod | null; // null → All time
  activityTops: Partial<Record<string, number>>; // activity → N; 0 or missing → not in the report
  overallTop: number; // 0 → no Top overall block
  tiers: ReportTier[];
}

export interface ReportRow {
  position?: number; // rankings only
  name: string;
  activity: string;
  rate: number;
  presents: number;
  total: number;
}

export type ReportSection =
  | { kind: "activity"; title: string; activity: string; n: number; rows: ReportRow[]; notice: string | null }
  | { kind: "overall"; title: string; n: number; rows: ReportRow[]; notice: string | null }
  | { kind: "tier"; title: string; tier: ReportTier; rows: ReportRow[]; notice: string | null };

// "" → 0 (activity left out); an integer 0–50 → that number; anything else → null (invalid input)
export function parseTopN(value: string): number | null {
  const v = value.trim();
  if (v === "") return 0;
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n <= MAX_TOP_N ? n : null;
}

// Download Report needs at least one block: a ranking with N > 0 or a Hive Status tier
export const hasReportBlock = (config: OutcomeReportConfig): boolean =>
  config.overallTop > 0 || config.tiers.length > 0 || ACTIVITIES.some(a => (config.activityTops[a] ?? 0) > 0);

const colleagues = (n: number) => `${n} ${n === 1 ? "colleague" : "colleagues"}`;

// Ranking order: rate desc, then more events attended, then alphabetical
const byRanking = (a: ReportRow, b: ReportRow) =>
  b.rate - a.rate || b.presents - a.presents || a.name.localeCompare(b.name);

const overallRow = (r: BeehaviorRow): ReportRow => ({
  name: r.attendee.name,
  activity: ALL_ACTIVITIES,
  rate: r.overallRate ?? 0,
  presents: r.overallPresents,
  total: r.overallTotal,
});

const ranked = (rows: ReportRow[], n: number) =>
  [...rows].sort(byRanking).slice(0, n).map((row, i) => ({ ...row, position: i + 1 }));

export function buildOutcomeReport(
  attendees: Attendee[],
  records: AttendanceRecord[],
  config: OutcomeReportConfig
): ReportSection[] {
  const rows = computeBeehavior(attendees, records, config.period);
  const eventDates = getEventDates(filterRecordsByPeriod(records, config.period));
  const sections: ReportSection[] = [];

  for (const activity of ACTIVITIES) {
    const n = config.activityTops[activity] ?? 0;
    if (n <= 0) continue;
    const title = `Top ${n} — ${activity}`;
    if (!eventDates[activity]?.size) {
      sections.push({ kind: "activity", title, activity, n, rows: [], notice: NO_EVENTS_MESSAGE });
      continue;
    }
    // Enrolled colleagues with ≥1 attendance in the period (nobody at 0% is ranked)
    const candidates: ReportRow[] = rows.flatMap(r => {
      const s = r.activityStats.find(st => st.activity === activity)!;
      return s.enrolled && s.presents > 0 && s.rate !== null
        ? [{ name: r.attendee.name, activity, rate: s.rate, presents: s.presents, total: s.total }]
        : [];
    });
    sections.push({
      kind: "activity",
      title,
      activity,
      n,
      rows: ranked(candidates, n),
      notice:
        candidates.length < n
          ? candidates.length === 0
            ? `No colleagues attended ${activity} in this period`
            : `Only ${colleagues(candidates.length)} attended ${activity} in this period`
          : null,
    });
  }

  const periodHasEvents = Object.keys(eventDates).length > 0;

  if (config.overallTop > 0) {
    const n = config.overallTop;
    const title = `Top ${n} — Overall`;
    const candidates = rows.filter(r => hasHiveData(r) && r.overallPresents > 0).map(overallRow);
    sections.push({
      kind: "overall",
      title,
      n,
      rows: periodHasEvents ? ranked(candidates, n) : [],
      notice: !periodHasEvents
        ? NO_EVENTS_MESSAGE
        : candidates.length < n
          ? candidates.length === 0
            ? "No colleagues attended any activity in this period"
            : `Only ${colleagues(candidates.length)} attended any activity in this period`
          : null,
    });
  }

  for (const tier of REPORT_TIERS) {
    if (!config.tiers.includes(tier)) continue;
    // Tier of the period Overall; No data colleagues (US-44) are never listed
    const members = rows
      .filter(r => hasHiveData(r) && r.tier.label === tier)
      .map(overallRow)
      .sort(byRanking);
    sections.push({
      kind: "tier",
      title: `Hive Status — ${tier}`,
      tier,
      rows: members,
      notice: !periodHasEvents
        ? NO_EVENTS_MESSAGE
        : members.length === 0
          ? `No ${tier} colleagues in this period`
          : null,
    });
  }

  return sections;
}

// "80% (4 of 5 events)"
export const formatAttendance = (row: Pick<ReportRow, "rate" | "presents" | "total">) =>
  `${row.rate}% (${row.presents} of ${row.total} ${row.total === 1 ? "event" : "events"})`;

export const formatReportPeriod = (period: DatePeriod | null) => (period ? formatPeriodLabel(period) : "All time");

const pad2 = (n: number) => String(n).padStart(2, "0");

// Local date and time, "2026-10-09 14:32"
export const formatGeneratedAt = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const reportFilename = (period: DatePeriod | null) =>
  period
    ? `honeycomb-outcome-report_${period.start}_${period.end}.txt`
    : "honeycomb-outcome-report_all-time.txt";

export function describeCriteria(config: OutcomeReportConfig): string[] {
  const lines: string[] = [];
  const tops = ACTIVITIES.filter(a => (config.activityTops[a] ?? 0) > 0).map(a => `${a} ${config.activityTops[a]}`);
  if (tops.length) lines.push(`Top per activity: ${tops.join(", ")}`);
  if (config.overallTop > 0) lines.push(`Top overall: ${config.overallTop}`);
  const tiers = REPORT_TIERS.filter(t => config.tiers.includes(t));
  if (tiers.length) lines.push(`Hive Status: ${tiers.join(", ")}`);
  return lines;
}

// Columns padded with spaces to the widest cell (header included); no trailing spaces
function alignColumns(table: string[][]): string[] {
  const widths = table[0].map((_, c) => Math.max(...table.map(row => row[c].length)));
  return table.map(row =>
    row
      .map((cell, c) => (c === row.length - 1 ? cell : cell.padEnd(widths[c])))
      .join("  ")
      .trimEnd()
  );
}

const RULE = "=".repeat(60);

export function formatOutcomeReport(
  sections: ReportSection[],
  config: OutcomeReportConfig,
  generatedAt: Date
): string {
  const lines: string[] = [
    REPORT_TITLE,
    RULE,
    `Period:     ${formatReportPeriod(config.period)}`,
    `Generated:  ${formatGeneratedAt(generatedAt)}`,
    "Criteria:",
    ...describeCriteria(config).map(c => `  - ${c}`),
  ];

  for (const section of sections) {
    lines.push("", RULE, section.title.toUpperCase(), RULE);
    if (section.rows.length) {
      const isRanking = section.kind !== "tier";
      const header = [...(isRanking ? ["#"] : []), "Name", "Activity", "Attendance"];
      const body = section.rows.map(r => [
        ...(isRanking ? [String(r.position)] : []),
        r.name,
        r.activity,
        formatAttendance(r),
      ]);
      lines.push(...alignColumns([header, ...body]));
    }
    if (section.notice) {
      if (section.rows.length) lines.push("");
      lines.push(section.notice);
    }
  }

  return lines.join("\n") + "\n";
}
