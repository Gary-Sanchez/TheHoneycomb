import { useState, useMemo } from "react";
import { Attendee, AttendanceRecord } from "../types";
import { computeBeehavior, getMonthlyRates } from "../beehavior";
import { Calendar, MessageSquare, Save, BookOpen } from "lucide-react";
import TierBadge from "./TierBadge";
import { Button, ChartFrame, Dialog, Field, StatusBadge, Textarea, type ChartDatum } from "./ui";
import { getChartTheme } from "../chartTheme";
import { getActivityTheme } from "../activityTheme";
import { formatDisplayDate } from "../utils";

// US-64: the Progress Report is a Dialog (US-57: Escape / close button / outside click, focus in and
// back to the trigger, page behind locked, 90dvh), its monthly chart is a ChartFrame (US-57) on the
// chart tokens (US-58), Hive Status is TierBadge and each activity shows its color and icon. No
// text or number changed (the US-41/42 rates and months are the same).

const MONTHLY_SERIES_KEY = "Attendance (%)";
const SECTION_HEADING = "flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-text-muted";
const SECTION_CARD = "rounded-card border border-border bg-cream/60 p-5";

// Activity name in its text color with its icon (the color never goes alone, US-58)
function ActivityName({ activity }: { activity: string }) {
  const theme = getActivityTheme(activity);
  const Icon = theme?.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 ${theme?.textClass ?? "text-forest"}`}>
      {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
      {activity}
    </span>
  );
}

interface ProgressReportModalProps {
  attendee: Attendee;
  records: AttendanceRecord[];
  notes?: string;
  onClose: () => void;
  onSaveNotes: (attendeeId: string, notes: string) => void;
  canEdit: boolean;
}

export default function ProgressReportModal({
  attendee,
  records,
  notes = "",
  onClose,
  onSaveNotes,
  canEdit,
}: ProgressReportModalProps) {
  const [teacherNotes, setTeacherNotes] = useState(notes);
  const [isSaved, setIsSaved] = useState(false);
  const chartColor = getChartTheme().primary;

  // 1. Gather all logs for this attendee, sorted chronologically descending (newest first)
  const attLogs = useMemo(() => {
    return records
      .filter(r => r.attendeeId === attendee.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [records, attendee]);

  // 2. Calculations
  // US-41: event-based Overall (attended events ÷ all events of the colleague's activities), the
  // same All-time value as the Bee-havior Hub — not presents ÷ the colleague's own records (~100%).
  // Only the colleague's row is needed; event totals come from every record.
  const beehavior = useMemo(() => computeBeehavior([attendee], records, null)[0], [attendee, records]);
  const rate = beehavior.overallRate; // null → no event to rate them on → "—"
  const presentLogs = beehavior.overallPresents;
  const totalLogs = beehavior.overallTotal;
  const absentLogs = totalLogs - presentLogs;

  // 3. Activity specific breakdown across all core activities (US-41: event-based, from computeBeehavior)
  const activityBreakdown = useMemo(() => {
    return beehavior.activityStats.map(s => ({
      activity: s.activity,
      total: s.total,
      presents: s.presents,
      absents: s.total - s.presents,
      rate: s.rate, // null → not enrolled (or no events) → "—"
    }));
  }, [beehavior]);

  // 4. Monthly Trend for this colleague (US-41: every month with a rate, not fixed April–June).
  // US-64: ChartFrame reads a null value as "No data" (never 0 %); getMonthlyRates leaves out months
  // without a rate, so today every point has a number.
  const monthlyData = useMemo<ChartDatum[]>(() => {
    return getMonthlyRates(attendee, records).map(m => ({
      label: m.label,
      [MONTHLY_SERIES_KEY]: m.rate,
    }));
  }, [attendee, records]);

  const handleSaveNotes = () => {
    if (!canEdit) return;
    onSaveNotes(attendee.id, teacherNotes);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      id="progress-report-modal"
      size="lg"
      className="sm:max-w-4xl"
      closeLabel="Close progress report"
      title={
        <span className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-chip border border-moss/40 bg-forest font-serif text-h3 font-bold text-cream shadow-md"
          >
            {attendee.name.split(" ").map(n => n[0]).join("")}
          </span>
          <span className="min-w-0 break-words">{attendee.name}</span>
        </span>
      }
      description={<span className="font-mono text-micro">{attendee.email || "No email registered"}</span>}
      footer={<Button onClick={onClose}>Close Report</Button>}
    >
      <div className="space-y-8">
        {/* Top Row Grid: KPI, Trend Chart, Activities breakdown */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* KPI Column */}
          <div className={`${SECTION_CARD} flex flex-col justify-between`}>
            <div>
              <h3 className={SECTION_HEADING}>Attendance Rate</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-serif text-kpi font-bold text-forest">{rate === null ? "—" : `${rate}%`}</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-micro font-semibold text-text-muted">
                <span>Present: <strong className="text-forest">{presentLogs}</strong></span>
                <span>Absent: <strong className="text-sand-text">{absentLogs}</strong></span>
                <span>Records: <strong>{totalLogs}</strong></span>
              </div>
            </div>

            {/* US-42: Hive Status from the All-time Overall above, same badge as the Bee-havior Hub */}
            <div className="mt-5 space-y-1.5" id="report-hive-status">
              <p className={SECTION_HEADING}>Hive Status</p>
              <TierBadge rate={rate} size="md" />
            </div>
          </div>

          {/* Attendance Chart Column */}
          <div className={`${SECTION_CARD} md:col-span-2`}>
            {monthlyData.length === 0 ? (
              <>
                <h3 className="mb-4 text-h3 font-semibold text-forest">Monthly Trends Progress</h3>
                <div className="flex h-36 items-center justify-center text-micro font-medium italic text-text-muted">
                  No attendance yet
                </div>
              </>
            ) : (
              <ChartFrame
                title="Monthly Trends Progress"
                kind="bar"
                data={monthlyData}
                series={[{ key: MONTHLY_SERIES_KEY, name: MONTHLY_SERIES_KEY, color: chartColor }]}
                labelHeader="Month"
                heightClass="h-52"
                hideTable
              />
            )}
          </div>
        </div>

        {/* Activity Breakdown Matrix */}
        <div className="space-y-4">
          <h3 className={SECTION_HEADING}>
            <BookOpen className="size-4" aria-hidden="true" />
            Activity Engagement Breakdown
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {activityBreakdown.map(bd => (
              <div key={bd.activity} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-serif text-body font-bold">
                      <ActivityName activity={bd.activity} />
                    </h4>
                    {/* US-41: the fraction behind the event-based rate */}
                    {bd.rate !== null && (
                      <p className="mt-0.5 text-micro font-medium text-text-muted">
                        Attended {bd.presents} of {bd.total} events
                      </p>
                    )}
                  </div>
                  <span
                    title={bd.rate === null ? undefined : `Attended ${bd.presents} of ${bd.total} events`}
                    className={`rounded-chip border border-border bg-cream px-2.5 py-0.5 text-micro font-bold ${
                      bd.rate === null ? "text-text-muted" : "text-forest"
                    }`}
                  >
                    {bd.rate === null ? "—" : `${bd.rate}%`}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-micro text-forest">
                  <div>
                    <p className="font-medium text-text-muted">Present</p>
                    <p className="mt-0.5 font-bold text-forest">{bd.presents}</p>
                  </div>
                  <div>
                    <p className="font-medium text-text-muted">Absent</p>
                    <p className="mt-0.5 font-bold text-sand-text">{bd.absents}</p>
                  </div>
                  <div>
                    <p className="font-medium text-text-muted">Total</p>
                    <p className="mt-0.5 font-bold text-forest">{bd.total}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Grid: Historical logs & Coaching notes */}
        <div className="grid grid-cols-1 gap-8 border-t border-border pt-8 md:grid-cols-2">
          {/* Left Column: Coaching Notes */}
          <div className="space-y-4">
            <h3 className={SECTION_HEADING}>
              <MessageSquare className="size-4" aria-hidden="true" />
              Coaching Progress Notes
            </h3>
            <div className="space-y-3">
              <Field label="Coaching notes" id="coaching-notes">
                <Textarea
                  value={teacherNotes}
                  onChange={(e: { target: { value: string } }) => {
                    setTeacherNotes(e.target.value);
                    if (isSaved) setIsSaved(false);
                  }}
                  placeholder="Record learning milestones, speaking progress, pronunciation issues, or assignment submissions here…"
                  rows={6}
                  readOnly={!canEdit}
                  className="resize-none read-only:bg-cream"
                />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-micro font-bold text-text-muted">
                  {canEdit ? "Notes are saved to The Honeycomb server." : "Read-only. Sign in as admin in Settings to edit notes."}
                </span>

                <Button size="sm" onClick={handleSaveNotes} disabled={!canEdit} icon={<Save className="size-3.5" />}>
                  {isSaved ? "Saved" : "Save Notes"}
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column: Historical Logs (no inner scroll: the dialog body is the only scroll area) */}
          <div className="space-y-4">
            <h3 className={SECTION_HEADING}>
              <Calendar className="size-4" aria-hidden="true" />
              Attendance History
            </h3>

            {attLogs.length === 0 ? (
              <div className="rounded-control border border-dashed border-border py-12 text-center text-micro font-medium italic text-text-muted">
                No attendance yet
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
                {attLogs.map(log => (
                  <li key={log.id} className="flex items-center justify-between gap-3 bg-surface p-3 text-micro">
                    <div>
                      <p className="font-bold">
                        <ActivityName activity={log.activity} />
                      </p>
                      <p className="mt-0.5 font-mono text-micro text-text-muted">{formatDisplayDate(log.date)}</p>
                    </div>

                    <StatusBadge tone={log.status === "present" ? "success" : "warning"}>
                      {log.status === "present" ? "Present" : "Absent"}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
