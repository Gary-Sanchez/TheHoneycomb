import { useState, useMemo, useRef } from "react";
import { Attendee, AttendanceRecord, ACTIVITIES } from "../types";
import {
  computeBeehavior,
  getActivityEventStats,
  getAttendedActivities,
  formatAvgAttendees,
  filterRecordsByPeriod,
  formatPeriodLabel,
  isValidPeriod,
  resolvePeriod,
  PeriodFilter,
  type BeehaviorRow,
} from "../beehavior";
import HiveStatusBadge from "./HiveStatusBadge";
import { averageOverall, formatAverageBase } from "../dashboardMetrics";
import DashboardPanels from "./DashboardPanels";
import { pluralize } from "../utils";
import { Users, FileText, CheckCircle2, Award, ArrowUpRight, Search, SearchX, FileDown, Moon, Egg, Flower2, Hexagon, type LucideIcon } from "lucide-react";
import OutcomeReportModal from "./OutcomeReportModal";
import { ACTIVITY_THEME, getActivityTheme } from "../activityTheme";
import Stat from "./ui/Stat";
import DataTable, { type DataTableColumn } from "./ui/DataTable";
import EmptyState from "./ui/EmptyState";
import Badge from "./ui/Badge";

interface DashboardStatsProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  // US-35: the period lives in App so it survives switching tabs
  periodFilter: PeriodFilter;
  onPeriodFilterChange: (filter: PeriodFilter) => void;
  onNavigate: (tab: string) => void;
}

const EMPTY_PERIOD_MESSAGE = "No events in this period";

// US-61: the Hive Status legend in the tier tokens, with TierBadge's icons (US-58). Same copy as 4.0.
const TIER_LEGEND: { title: string; meaning: string; icon: LucideIcon; text: string; border: string }[] = [
  { title: "Dormant (0–25%)", meaning: "Hibernating. Rare sightings. Still getting to know the honeycomb.", icon: Moon, text: "text-tier-dormant", border: "border-tier-dormant-border" },
  { title: "Hatcher (26–50%)", meaning: "Getting cozy. Halfway to becoming a regular flyer.", icon: Egg, text: "text-tier-hatcher", border: "border-tier-hatcher-border" },
  { title: "Forager (51–75%)", meaning: "Honey maker. Solid presence, regularly contributing to the buzz.", icon: Flower2, text: "text-tier-forager", border: "border-tier-forager-border" },
  { title: "Busy Bee (76–100%)", meaning: "Queen's favorite. Elite attendance and top-tier dedication.", icon: Hexagon, text: "text-tier-busy-bee", border: "border-tier-busy-bee-border" },
];

/** "(attended/total)" after a rate: muted, never below 12 px. */
const fraction = (presents: number, total: number) => (
  <span className="ml-1 text-micro font-medium text-text-muted">({presents}/{total})</span>
);

export default function DashboardStats({
  attendees,
  records: allRecords,
  periodFilter,
  onPeriodFilterChange,
  onNavigate,
}: DashboardStatsProps) {
  // State for search query in Bee-havior table
  const [beeSearchQuery, setBeeSearchQuery] = useState("");
  // US-40: Outcome Report dialog; focus returns to its trigger on close
  const [reportOpen, setReportOpen] = useState(false);
  const reportButtonRef = useRef<HTMLButtonElement>(null);

  // US-35: the range actually applied (null → All time). An incomplete or inverted custom range isn't applied.
  const period = useMemo(() => resolvePeriod(periodFilter), [periodFilter]);
  const invalidRange =
    periodFilter.mode === "custom" &&
    Boolean(periodFilter.start && periodFilter.end) &&
    !isValidPeriod(periodFilter.start, periodFilter.end);
  // Every metric below except enrollment is computed over the events inside the period
  const records = useMemo(() => filterRecordsByPeriod(allRecords, period), [allRecords, period]);
  const periodHasNoEvents = period !== null && records.length === 0;

  // 1. Core KPIs
  // US-43: same definition of "participating" as the Overlap Cross-Referencer — at least one present
  // (Manual Check-In also logs absences, and those don't count)
  const activitiesAttended = useMemo(() => getAttendedActivities(attendees, records), [attendees, records]);

  // All time: the whole directory. With a period: colleagues who attended at least one event in it.
  const totalAttendees = period
    ? attendees.filter(att => (activitiesAttended[att.id] || []).length > 0).length
    : attendees.length;

  const multiActivityCount = attendees.filter(att => (activitiesAttended[att.id] || []).length > 1).length;

  const multiActivityPercentage = totalAttendees
    ? Math.round((multiActivityCount / totalAttendees) * 100)
    : 0;

  // 2. Activity Comparison Data
  const activityData = useMemo(() => {
    return ACTIVITIES.map(act => {
      const activeAttendees = attendees.filter(att =>
        records.some(r => r.attendeeId === att.id && r.activity === act)
      ).length;

      const actLogs = records.filter(r => r.activity === act);
      const totalLogs = actLogs.length;
      const presents = actLogs.filter(r => r.status === "present").length;
      // null → the card shows "—" (the activity has no events in the active period)
      const attendanceRate = totalLogs ? Math.round((presents / totalLogs) * 100) : null;
      // US-29: registered events + avg attendees per event, derived from records on every render
      const { events, avgPresent } = getActivityEventStats(records, act);

      return {
        name: act,
        events,
        avgPresent,
        shortName: act,
        "Active Attendees": activeAttendees,
        "Attendance Rate (%)": attendanceRate,
      };
    });
  }, [attendees, records]);

  // Caserits Bee-havior table (US-24): rates are computed over recorded events, not the colleague's own logs.
  // US-35: it gets every record so enrollment ignores the period; the period only trims the events counted.
  const beehaviorData = useMemo(() => computeBeehavior(attendees, allRecords, period), [attendees, allRecords, period]);

  // US-45: Avg. Attendance Rate = average of the Hub's Overall column; No data colleagues are left out
  const avgAttendance = useMemo(() => averageOverall(beehaviorData), [beehaviorData]);

  // Filtered list of Bee-haviors based on search
  const filteredBeehaviorData = useMemo(() => {
    if (!beeSearchQuery.trim()) return beehaviorData;
    const query = beeSearchQuery.toLowerCase();
    return beehaviorData.filter(item =>
      item.attendee.name.toLowerCase().includes(query) ||
      (item.attendee.email && item.attendee.email.toLowerCase().includes(query))
    );
  }, [beehaviorData, beeSearchQuery]);

  const emptyPeriod = (id: string, className = "") => (
    <p id={id} className={`text-body text-natural-forest italic font-medium ${className}`}>
      {EMPTY_PERIOD_MESSAGE}
    </p>
  );

  const dateFieldClass =
    "bg-surface border border-input-border rounded-control px-3 py-1.5 text-sm text-natural-forest focus:border-natural-forest aria-[invalid=true]:border-danger";

  // US-61 (BUG-11): the Hub is a DataTable, so it scrolls sideways on its own at 375 / 768 px with the
  // name column pinned. Activity headers carry their icon (US-58); rates are in the activity's text token.
  const hubColumns: DataTableColumn<BeehaviorRow>[] = [
    {
      key: "name",
      header: "Caserits",
      cell: ({ attendee }) => (
        <span className="flex items-center gap-3">
          {/* Below sm the pinned column drops the initials and lets the name wrap, so the scrolled
              columns keep room for their badges (QA #73) */}
          <span
            aria-hidden="true"
            className="h-8.5 w-8.5 shrink-0 rounded-chip bg-natural-wheat/40 text-natural-forest hidden sm:flex items-center justify-center font-serif font-bold text-xs border border-natural-border/50"
          >
            {attendee.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
          </span>
          <span className="flex flex-col">
            <span className="font-bold text-natural-forest text-xs leading-tight whitespace-normal sm:whitespace-nowrap">{attendee.name}</span>
            {/* US-61: the email may wrap so the Hub fits a desktop width */}
            {attendee.email && <span className="text-micro text-text-muted font-mono font-normal mt-0.5 whitespace-normal break-all">{attendee.email}</span>}
          </span>
        </span>
      ),
    },
    ...ACTIVITIES.map((act, idx): DataTableColumn<BeehaviorRow> => {
      const theme = ACTIVITY_THEME[act];
      const Icon = theme.icon;
      return {
        key: act,
        header: (
          <span className="inline-flex items-start gap-1.5">
            <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${theme.textClass}`} />
            <span>{act}</span>
          </span>
        ),
        cell: ({ activityStats }) => {
          const stat = activityStats[idx];
          return stat.rate === null ? (
            <span className="font-mono text-text-muted">—</span>
          ) : (
            <span
              className={`font-mono font-bold ${getActivityTheme(stat.activity)?.textClass ?? ""}`}
              title={`Attended ${stat.presents} of ${stat.total} events`}
            >
              {stat.rate}%
              {fraction(stat.presents, stat.total)}
            </span>
          );
        },
      };
    }),
    {
      key: "overall",
      header: "Overall",
      cell: ({ overallRate, overallPresents, overallTotal }) =>
        overallRate === null ? (
          <span className="font-mono text-text-muted">—</span>
        ) : (
          <span className="font-mono font-bold text-natural-forest" title={`Attended ${overallPresents} of ${overallTotal} events`}>
            {overallRate}%
            {fraction(overallPresents, overallTotal)}
          </span>
        ),
    },
    {
      key: "hive-status",
      header: "Hive Status",
      // US-42: the shared badge (TierBadge since US-58); no Overall → No data (US-44)
      cell: ({ overallRate }) => <HiveStatusBadge rate={overallRate} />,
    },
    {
      key: "multi-activity",
      header: "Multi-Activity",
      cell: ({ isMulti, participatedCount }) =>
        isMulti ? (
          <Badge tone="warning" icon={<span>🍯</span>} className="animate-pulse-subtle">
            Yes ({participatedCount} Activities)
          </Badge>
        ) : (
          <Badge>Single ({participatedCount})</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in" id="dashboard-tab">
      {/* US-35: period selector. Only changes the view, never the stored data. */}
      <section
        id="period-selector"
        aria-label="Dashboard period"
        className="bg-surface rounded-card border border-border shadow-sm p-5 space-y-3"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="period-mode" className="text-sm font-bold text-natural-forest">Period</label>
            <select
              id="period-mode"
              value={periodFilter.mode}
              onChange={(e) => onPeriodFilterChange({ ...periodFilter, mode: e.target.value as PeriodFilter["mode"] })}
              className={dateFieldClass}
            >
              <option value="all">All time</option>
              <option value="custom">Custom range</option>
            </select>
          </div>

          {periodFilter.mode === "custom" && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="period-start" className="text-sm font-bold text-natural-forest">Start date</label>
                <input
                  id="period-start"
                  type="date"
                  value={periodFilter.start}
                  onChange={(e) => onPeriodFilterChange({ ...periodFilter, start: e.target.value })}
                  aria-invalid={invalidRange}
                  aria-describedby={invalidRange ? "period-error" : undefined}
                  className={dateFieldClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="period-end" className="text-sm font-bold text-natural-forest">End date</label>
                <input
                  id="period-end"
                  type="date"
                  value={periodFilter.end}
                  onChange={(e) => onPeriodFilterChange({ ...periodFilter, end: e.target.value })}
                  aria-invalid={invalidRange}
                  aria-describedby={invalidRange ? "period-error" : undefined}
                  className={dateFieldClass}
                />
              </div>
            </>
          )}

          <p id="period-showing" className="text-sm font-semibold text-natural-forest ml-auto">
            Showing: {period ? formatPeriodLabel(period) : "All time"}
          </p>

          <button
            ref={reportButtonRef}
            type="button"
            id="generate-outcome-report"
            onClick={() => setReportOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-2 px-4 py-2 bg-natural-forest hover:bg-forest-hover text-white font-bold text-sm rounded-control shadow-sm transition"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Generate Outcome Report
          </button>
        </div>

        {invalidRange && (
          <p id="period-error" role="alert" className="text-sm font-semibold text-danger bg-danger-bg border border-danger-border rounded-control px-3 py-2">
            The start date must be on or before the end date. The range was not applied.
          </p>
        )}
      </section>

      {reportOpen && (
        <OutcomeReportModal
          attendees={attendees}
          records={allRecords}
          initialPeriod={periodFilter}
          onClose={() => setReportOpen(false)}
          returnFocusRef={reportButtonRef}
        />
      )}

      {/* KPI Row (US-61): 1 → 2 → 4 columns; each KPI is a Stat <dl>, not a heading */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Total Attendees */}
        <Stat
          id="kpi-total-attendees"
          label="Total Caserits"
          icon={<Users className="h-6 w-6" />}
          value={periodHasNoEvents ? emptyPeriod("kpi-total-attendees-empty", "font-sans") : totalAttendees}
          hint={periodHasNoEvents ? undefined : period ? "Attended in this period" : "Active across all activities"}
        />

        {/* Card 2: Attendance Rate */}
        <Stat
          id="kpi-attendance-rate"
          label="Avg. Attendance Rate"
          icon={<CheckCircle2 className="h-6 w-6" />}
          value={<span id="kpi-attendance-rate-value">{avgAttendance.rate === null ? "—" : `${avgAttendance.rate}%`}</span>}
          hint={
            periodHasNoEvents ? (
              emptyPeriod("kpi-attendance-rate-empty")
            ) : (
              <span id="kpi-attendance-rate-base">
                {avgAttendance.rate === null ? "No colleagues with an Overall yet" : formatAverageBase(avgAttendance.colleagues)}
              </span>
            )
          }
        />

        {/* Card 3: Multi-Enrollment */}
        <Stat
          id="kpi-multi-enrollment"
          label="Multi-Activity Caserits"
          icon={<Award className="h-6 w-6" />}
          value={periodHasNoEvents ? emptyPeriod("kpi-multi-enrollment-empty", "font-sans") : `${multiActivityPercentage}%`}
          hint={periodHasNoEvents ? undefined : `${pluralize(multiActivityCount, "colleague")} in 2+ activities`}
        />

        {/* Card 4: Quick Action. A native button (US-61): Enter / Space for free, cream focus ring on forest */}
        <button
          type="button"
          id="kpi-quick-parse"
          aria-label="Open Import Forage Logs"
          onClick={() => onNavigate("parser")}
          className="focus-ring-on-dark bg-natural-forest text-natural-cream rounded-card p-6 border border-natural-forest/25 shadow-lg flex flex-col justify-between text-left hover:shadow-xl hover:bg-forest-hover transition-all duration-300 cursor-pointer"
        >
          <span className="flex w-full justify-between items-start">
            <span className="p-2.5 bg-white/10 text-natural-wheat rounded-xl">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <ArrowUpRight className="h-5 w-5 text-natural-sand" aria-hidden="true" />
          </span>
          <span className="mt-4 block">
            <span className="block text-micro uppercase tracking-widest text-natural-wheat font-bold">Import Forage Logs</span>
            <span className="block text-lg font-serif font-bold mt-1 text-white leading-tight">Smart Doc Parser</span>
            <span className="block text-xs text-natural-wheat mt-1">Upload Excel, .docx, or .txt</span>
          </span>
        </button>
      </div>

      {/* NEW: Caserits Bee-havior Section */}
      <div id="caserits-bee-havior-section" className="bg-surface rounded-card border border-border p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif font-bold text-natural-forest flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">🍯</span> Caserits Bee-havior Hub
            </h3>
            <p className="text-xs text-text-muted font-medium mt-1">
              Every colleague, sorted alphabetically, with their attendance rate in each of the four activities and their Hive Status.
            </p>
          </div>

          {/* Quick Search */}
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" aria-hidden="true" />
            <input
              aria-label="Search Caserits"
              type="text"
              placeholder="Search colleagues by name…"
              value={beeSearchQuery}
              onChange={(e) => setBeeSearchQuery(e.target.value)}
              className="w-full bg-surface border border-input-border rounded-control pl-10 pr-4 py-2 text-xs text-natural-forest placeholder:text-text-muted focus:border-natural-forest font-medium"
            />
          </div>
        </div>

        {periodHasNoEvents ? (
          emptyPeriod("beehavior-empty", "p-12 text-center bg-natural-cream/15 rounded-card border border-natural-border")
        ) : (
        <>
        {/* Hive Status legend: tier tokens and TierBadge's icons (US-58) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-natural-cream/20 rounded-card border border-natural-border/40">
          {TIER_LEGEND.map(({ title, meaning, icon: Icon, text, border }) => (
            <div key={title} className={`flex items-start gap-2.5 p-3 rounded-2xl bg-surface border ${border}`}>
              <Icon aria-hidden="true" className={`h-5 w-5 mt-0.5 shrink-0 ${text}`} strokeWidth={2.25} />
              <div>
                <h5 className={`text-xs font-bold ${text}`}>{title}</h5>
                <p className="text-micro text-text-muted leading-normal font-medium">{meaning}</p>
              </div>
            </div>
          ))}
        </div>

        {/* The Comprehensive Bee-havior Table (US-61: empty directory and empty search are told apart) */}
        {filteredBeehaviorData.length === 0 ? (
          beehaviorData.length === 0 ? (
            <EmptyState id="beehavior-no-colleagues" headingLevel={4} icon={<Users className="h-6 w-6" />} title="No colleagues yet." />
          ) : (
            <EmptyState id="beehavior-no-match" headingLevel={4} icon={<SearchX className="h-6 w-6" />} title="No colleagues match your search." />
          )
        ) : (
          <DataTable<BeehaviorRow>
            caption="Caserits Bee-havior Hub"
            hideCaption
            columns={hubColumns}
            rows={filteredBeehaviorData}
            getRowKey={row => row.attendee.id}
            stickyFirstColumn
            dense
            className="max-h-120"
          />
        )}
        </>
        )}
      </div>

      {/* Activity Status Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-serif font-bold text-natural-forest">Activities Matrix Profile</h3>
        {periodHasNoEvents ? (
          emptyPeriod("matrix-empty", "p-8 text-center bg-surface rounded-card border border-border")
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {activityData.map((act, index) => {
            const theme = ACTIVITY_THEME[act.name];
            const Icon = theme.icon;
            const isWeekly = act.name === "Speakeasy";
            return (
              <div
                key={act.name}
                className="bg-surface rounded-card p-5 border border-border shadow-sm hover:border-natural-sage hover:-translate-y-1 transition duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    {/* Activity color as text token on cream (≥ 4.5:1) plus its icon, never color alone */}
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-micro font-bold px-2.5 py-1 rounded-chip uppercase tracking-wider bg-cream border border-border ${theme.textClass}`}
                    >
                      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      Activity {index + 1}
                    </span>
                    <span className="text-xs text-text-muted font-semibold text-right">Voluntary participation</span>
                  </div>
                  <h4 className="font-serif font-bold text-natural-forest text-base mt-3 leading-snug line-clamp-1">{act.name}</h4>
                  <p className="text-xs text-text-muted mt-1">{isWeekly ? "Weekly events" : "Biweekly events"}</p>
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-text-muted">Events:</span>
                    <span className="font-bold text-natural-forest">{act.events}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-text-muted">Avg. colleagues per event:</span>
                    <span className="font-bold text-natural-forest" title="Present colleagues per event">
                      {formatAvgAttendees(act.avgPresent)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-text-muted">Attendance rate:</span>
                    <span className={`font-bold ${theme.textClass}`}>
                      {act["Attendance Rate (%)"] === null ? "—" : `${act["Attendance Rate (%)"]}%`}
                    </span>
                  </div>
                  {/* Visual Progress bar */}
                  <div className="h-2 bg-natural-cream rounded-full border border-natural-border/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${theme.bgClass}`}
                      style={{ width: `${act["Attendance Rate (%)"] ?? 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* US-36: Attendance Trends, Cross-Activity Comparisons and Engagement as collapsible panels */}
      <DashboardPanels
        attendees={attendees}
        allRecords={allRecords}
        period={period}
        rows={beehaviorData}
        periodHasNoEvents={periodHasNoEvents}
        emptyMessage={EMPTY_PERIOD_MESSAGE}
      />
    </div>
  );
}
