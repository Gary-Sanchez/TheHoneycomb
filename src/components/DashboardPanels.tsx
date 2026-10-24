import { ReactNode, useMemo, useState } from "react";
import { Attendee, AttendanceRecord } from "../types";
import { BeehaviorRow, DatePeriod, formatAvgAttendees } from "../beehavior";
import {
  TrendGrouping,
  computeActivityComparison,
  computeAttendanceTrends,
  computeEngagement,
} from "../dashboardMetrics";
import { ChevronDown } from "lucide-react";
import ChartFrame, { NO_DATA } from "./ui/ChartFrame";
import { getChartTheme } from "../chartTheme";

// US-36: the Dashboard's metric panels (accordion). Every rate comes from the Hub's event-based maths.

interface DashboardPanelsProps {
  attendees: Attendee[];
  allRecords: AttendanceRecord[];
  period: DatePeriod | null;
  // computeBeehavior(attendees, allRecords, period) — the rows the Hub renders
  rows: BeehaviorRow[];
  periodHasNoEvents: boolean;
  emptyMessage: string;
}

type PanelId = "trends" | "comparison" | "engagement";

const formatRate = (rate: number | null) => (rate === null ? NO_DATA : `${rate}%`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// US-61: every chart is a ChartFrame (role="img" with its aria-label, no Recharts accessibility
// layer, tooltip / axis / grid from the chart tokens) with colors from getChartTheme(). The frame's
// title stays sr-only (the panel header or the h4 already says it), the aria-labels are the ones
// these panels announced in 4.0, and hideTable: each panel keeps its own, richer table below.

function Panel({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: PanelId;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface rounded-card border border-border shadow-sm" id={`panel-${id}`}>
      <h3>
        {/* A native <button> already toggles on Enter and Space */}
        <button
          type="button"
          id={`panel-${id}-header`}
          aria-expanded={open}
          aria-controls={`panel-${id}-content`}
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 p-5 text-left rounded-card hover:bg-natural-cream/30 transition"
        >
          <span>
            <span className="block text-lg font-serif font-bold text-natural-forest">{title}</span>
            <span className="block text-sm font-medium text-natural-forest mt-0.5">{summary}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 text-natural-forest transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h3>
      <div
        id={`panel-${id}-content`}
        role="region"
        aria-labelledby={`panel-${id}-header`}
        hidden={!open}
        className="px-5 pb-5 space-y-5"
      >
        {/* Charts only mount while open: a hidden ResponsiveContainer would measure 0 px wide */}
        {open && children}
      </div>
    </section>
  );
}

// US-61: a panel table scrolls sideways inside its own box (never the page, e.g. at 375 px). The box is
// a focusable region named by an existing heading, so keyboard users can scroll it too.
function TableScroll({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <div role="region" aria-labelledby={labelledBy} tabIndex={0} className="overflow-x-auto focus-ring-inset border border-natural-border rounded-2xl">
      {children}
    </div>
  );
}

const thClass = "p-3 text-left text-xs font-bold uppercase tracking-wider text-natural-forest";
const tdClass = "p-3 text-sm text-natural-forest";

export default function DashboardPanels({
  attendees,
  allRecords,
  period,
  rows,
  periodHasNoEvents,
  emptyMessage,
}: DashboardPanelsProps) {
  // Only Attendance Trends starts open. Lives here (not keyed by period) so it survives period changes.
  const [open, setOpen] = useState<Record<PanelId, boolean>>({ trends: true, comparison: false, engagement: false });
  const toggle = (id: PanelId) => setOpen(prev => ({ ...prev, [id]: !prev[id] }));
  const [grouping, setGrouping] = useState<TrendGrouping>("month");

  const trends = useMemo(
    () => computeAttendanceTrends(attendees, allRecords, period, grouping),
    [attendees, allRecords, period, grouping]
  );
  const comparison = useMemo(() => computeActivityComparison(rows, allRecords, period), [rows, allRecords, period]);
  const engagement = useMemo(() => computeEngagement(rows, allRecords, period), [rows, allRecords, period]);

  const totalEvents = trends.reduce((sum, p) => sum + p.events, 0);
  const intervalsWithEvents = trends.filter(p => p.events > 0).length;
  const unit = grouping === "month" ? "month" : "week";
  const trendsSummary = periodHasNoEvents
    ? emptyMessage
    : `${plural(totalEvents, "event")} across ${plural(intervalsWithEvents, unit)}, grouped by ${unit}`;

  const ranked = comparison.filter(c => c.avgRate !== null).sort((a, b) => (b.avgRate as number) - (a.avgRate as number));
  const comparisonSummary = periodHasNoEvents
    ? emptyMessage
    : ranked.length
      ? `Highest average attendance rate: ${ranked[0].activity} (${ranked[0].avgRate}%)`
      : "No activity has events in this period";

  const engagementSummary = periodHasNoEvents
    ? emptyMessage
    : `${engagement.tiers
        .slice()
        .reverse()
        .map(t => `${t.count} ${t.label}`)
        .join(" · ")} · ${plural(engagement.newColleagues, "new colleague")}`;

  const empty = <p className="text-sm italic font-medium text-natural-forest py-6 text-center">{emptyMessage}</p>;

  const trendsLabel =
    "Attendance rate by " +
    unit +
    ": " +
    trends.map(p => `${p.label} ${p.rate === null ? "no data" : `${p.rate}%`}`).join(", ");
  const comparisonLabel =
    "Average attendance rate by activity: " +
    comparison.map(c => `${c.activity} ${c.avgRate === null ? "no data" : `${c.avgRate}%`}`).join(", ");
  const engagementLabel =
    "Colleagues per Hive Status: " + engagement.tiers.map(t => `${t.label} ${t.count}`).join(", ");

  const chartColor = getChartTheme().primary;

  return (
    <div className="space-y-4" id="dashboard-panels">
      <Panel id="trends" title="Attendance Trends" summary={trendsSummary} open={open.trends} onToggle={() => toggle("trends")}>
        {periodHasNoEvents ? (
          empty
        ) : (
          <>
            <div className="flex items-center gap-2" role="group" aria-label="Group trends by">
              <span className="text-sm font-bold text-natural-forest">Group by:</span>
              {(["month", "week"] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={grouping === g}
                  onClick={() => setGrouping(g)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                    grouping === g
                      ? "bg-natural-forest text-white border-natural-forest"
                      : "bg-white text-natural-forest border-natural-border hover:bg-natural-cream/40"
                  }`}
                >
                  {g === "month" ? "Month" : "Week"}
                </button>
              ))}
            </div>

            {/* null (no events) leaves a gap: "No data", never drawn as 0% */}
            <ChartFrame
              title="Attendance Trends"
              hideTitle
              ariaLabel={trendsLabel}
              data={trends.map(p => ({ label: p.label, rate: p.rate }))}
              series={[{ key: "rate", name: "Attendance rate (%)", color: chartColor }]}
              heightClass="h-70"
              hideTable
            />

            <TableScroll labelledBy="panel-trends-header">
              <table className="w-full border-collapse" id="trends-table">
                <thead className="bg-natural-cream/50 border-b border-natural-border">
                  <tr>
                    <th scope="col" className={thClass}>{grouping === "month" ? "Month" : "Week"}</th>
                    <th scope="col" className={thClass}>Events</th>
                    <th scope="col" className={thClass}>Avg. attendees per event</th>
                    <th scope="col" className={thClass}>Attendance rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-natural-border/60">
                  {trends.map(p => (
                    <tr key={p.key}>
                      <th scope="row" className={`${tdClass} text-left font-semibold`}>{p.label}</th>
                      <td className={tdClass}>{p.events}</td>
                      <td className={tdClass}>{p.avgAttendees === null ? NO_DATA : formatAvgAttendees(p.avgAttendees)}</td>
                      <td className={tdClass}>{formatRate(p.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </Panel>

      <Panel
        id="comparison"
        title="Cross-Activity Comparisons"
        summary={comparisonSummary}
        open={open.comparison}
        onToggle={() => toggle("comparison")}
      >
        {periodHasNoEvents ? (
          empty
        ) : (
          <>
            <ChartFrame
              title="Cross-Activity Comparisons"
              hideTitle
              ariaLabel={comparisonLabel}
              kind="bar"
              data={comparison.map(c => ({ label: c.activity, avgRate: c.avgRate }))}
              series={[{ key: "avgRate", name: "Avg. attendance rate of enrolled colleagues (%)", color: chartColor }]}
              heightClass="h-65"
              hideTable
            />

            <TableScroll labelledBy="panel-comparison-header">
              <table className="w-full border-collapse" id="comparison-table">
                <thead className="bg-natural-cream/50 border-b border-natural-border">
                  <tr>
                    <th scope="col" className={thClass}>Activity</th>
                    <th scope="col" className={thClass}>Events</th>
                    <th scope="col" className={thClass}>Avg. attendees per event</th>
                    <th scope="col" className={thClass}>Unique Caserits</th>
                    <th scope="col" className={thClass}>Avg. attendance rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-natural-border/60">
                  {comparison.map(c => (
                    <tr key={c.activity}>
                      <th scope="row" className={`${tdClass} text-left font-semibold`}>{c.activity}</th>
                      <td className={tdClass}>{c.events}</td>
                      <td className={tdClass}>{c.avgAttendees === null ? NO_DATA : formatAvgAttendees(c.avgAttendees)}</td>
                      <td className={tdClass}>{c.uniqueAttendees}</td>
                      <td className={tdClass}>{formatRate(c.avgRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </Panel>

      <Panel
        id="engagement"
        title="Engagement"
        summary={engagementSummary}
        open={open.engagement}
        onToggle={() => toggle("engagement")}
      >
        {periodHasNoEvents ? (
          empty
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-natural-forest">Colleagues per Hive Status</h4>
              <ChartFrame
                title="Colleagues per Hive Status"
                hideTitle
                ariaLabel={engagementLabel}
                kind="bar"
                valueFormat="count"
                data={engagement.tiers.map(t => ({ label: t.label, count: t.count }))}
                series={[{ key: "count", name: "Colleagues", color: chartColor }]}
                heightClass="h-55"
                hideTable
              />
              <ul className="grid grid-cols-2 gap-2" id="engagement-tiers">
                {engagement.tiers.map(t => (
                  <li key={t.label} className="flex justify-between rounded-xl border border-natural-border px-3 py-2 text-sm">
                    <span className="font-semibold text-natural-forest">{t.label}</span>
                    <span className="font-bold text-natural-forest">{t.count}</span>
                  </li>
                ))}
              </ul>
              {engagement.noData > 0 && (
                <p className="text-xs font-medium text-natural-forest">
                  {plural(engagement.noData, "colleague")} without events to rate in this period (No data){" "}
                  {engagement.noData === 1 ? "is" : "are"} not counted.
                </p>
              )}
            </div>

            <div className="space-y-3">
              <h4 id="engagement-new-heading" className="text-sm font-bold text-natural-forest">New colleagues (first attendance in this period)</h4>
              <TableScroll labelledBy="engagement-new-heading">
                <table className="w-full border-collapse" id="engagement-new">
                  <thead className="bg-natural-cream/50 border-b border-natural-border">
                    <tr>
                      <th scope="col" className={thClass}>Activity</th>
                      <th scope="col" className={thClass}>New colleagues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-natural-border/60">
                    {engagement.newByActivity.map(n => (
                      <tr key={n.activity}>
                        <th scope="row" className={`${tdClass} text-left font-semibold`}>{n.activity}</th>
                        <td className={tdClass}>{n.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
