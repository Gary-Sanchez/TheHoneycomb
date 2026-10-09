import { ReactNode, useMemo, useState } from "react";
import { Attendee, AttendanceRecord } from "../types";
import { BeehaviorRow, DatePeriod, formatAvgAttendees } from "../beehavior";
import {
  TrendGrouping,
  computeActivityComparison,
  computeAttendanceTrends,
  computeEngagement,
} from "../dashboardMetrics";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChevronDown } from "lucide-react";

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

const NO_DATA = "No data";
const FOREST = "#2D3E35";
const PERCENT_TICKS = [0, 25, 50, 75, 100];
const formatRate = (rate: number | null) => (rate === null ? NO_DATA : `${rate}%`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const tooltipProps = {
  contentStyle: { backgroundColor: FOREST, borderRadius: "12px", border: "1px solid #E9E5D9", color: "#FDFBF7" },
  itemStyle: { color: "#FAEDCD" },
  labelStyle: { fontWeight: "bold" },
};

const percentAxis = (
  <YAxis
    domain={[0, 100]}
    ticks={PERCENT_TICKS}
    tickFormatter={(v: number) => `${v}%`}
    tickLine={false}
    axisLine={false}
    tick={{ fill: FOREST, fontSize: 12 }}
  />
);

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
    <section className="bg-white rounded-[24px] border border-[#E9E5D9] shadow-sm" id={`panel-${id}`}>
      <h3>
        {/* A native <button> already toggles on Enter and Space */}
        <button
          type="button"
          id={`panel-${id}-header`}
          aria-expanded={open}
          aria-controls={`panel-${id}-content`}
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 p-5 text-left rounded-[24px] focus:outline-none focus-visible:ring-2 focus-visible:ring-natural-forest focus-visible:ring-offset-2 hover:bg-natural-cream/30 transition"
        >
          <span>
            <span className="block text-lg font-serif font-bold text-[#1A1A1A]">{title}</span>
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

const thClass = "p-3 text-left text-xs font-bold uppercase tracking-wider text-natural-forest";
const tdClass = "p-3 text-sm text-[#1A1A1A]";

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
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-natural-forest ${
                    grouping === g
                      ? "bg-natural-forest text-white border-natural-forest"
                      : "bg-white text-natural-forest border-natural-border hover:bg-natural-cream/40"
                  }`}
                >
                  {g === "month" ? "Month" : "Week"}
                </button>
              ))}
            </div>

            <div className="h-[280px]" role="img" aria-label={trendsLabel}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E5D9" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: FOREST, fontSize: 12 }} />
                  {percentAxis}
                  <Tooltip {...tooltipProps} formatter={(v) => (v === null || v === undefined ? NO_DATA : `${v}%`)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: FOREST }} />
                  {/* null (no events) leaves a gap: "No data", never drawn as 0% */}
                  <Line
                    type="monotone"
                    dataKey="rate"
                    name="Attendance rate (%)"
                    stroke={FOREST}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto border border-natural-border rounded-2xl">
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
            </div>
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
            <div className="h-[260px]" role="img" aria-label={comparisonLabel}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparison} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E5D9" />
                  <XAxis dataKey="activity" tickLine={false} axisLine={false} tick={{ fill: FOREST, fontSize: 12 }} />
                  {percentAxis}
                  <Tooltip {...tooltipProps} formatter={(v) => (v === null || v === undefined ? NO_DATA : `${v}%`)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: FOREST }} />
                  <Bar
                    dataKey="avgRate"
                    name="Avg. attendance rate of enrolled colleagues (%)"
                    fill={FOREST}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto border border-natural-border rounded-2xl">
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
            </div>
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
              <div className="h-[220px]" role="img" aria-label={engagementLabel}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={engagement.tiers} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E5D9" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: FOREST, fontSize: 12 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: FOREST, fontSize: 12 }} />
                    <Tooltip {...tooltipProps} />
                    <Legend wrapperStyle={{ fontSize: 12, color: FOREST }} />
                    <Bar dataKey="count" name="Colleagues" fill={FOREST} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="grid grid-cols-2 gap-2" id="engagement-tiers">
                {engagement.tiers.map(t => (
                  <li key={t.label} className="flex justify-between rounded-xl border border-natural-border px-3 py-2 text-sm">
                    <span className="font-semibold text-natural-forest">{t.label}</span>
                    <span className="font-bold text-[#1A1A1A]">{t.count}</span>
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
              <h4 className="text-sm font-bold text-natural-forest">New colleagues (first attendance in this period)</h4>
              <div className="overflow-x-auto border border-natural-border rounded-2xl">
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
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
