import { useEffect, useRef, useState, RefObject } from "react";
import { X, Download } from "lucide-react";
import { Attendee, AttendanceRecord, ACTIVITIES } from "../types";
import { ALL_TIME, PeriodFilter, formatPeriodLabel, isValidPeriod, resolvePeriod } from "../beehavior";
import {
  MAX_TOP_N,
  OutcomeReportConfig,
  REPORT_TIERS,
  ReportTier,
  buildOutcomeReport,
  formatOutcomeReport,
  hasReportBlock,
  parseTopN,
  reportFilename,
} from "../outcomeReport";

interface OutcomeReportModalProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  // The Dashboard's period filter; the panel starts on the period the Dashboard is applying
  initialPeriod: PeriodFilter;
  onClose: () => void;
  // The Generate Outcome Report button, focused again when the dialog closes
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Text file built in the browser and saved through a temporary <a download> (no server route)
function downloadText(filename: string, text: string) {
  const blob = new Blob(["﻿", text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function OutcomeReportModal({
  attendees,
  records,
  initialPeriod,
  onClose,
  returnFocusRef,
}: OutcomeReportModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() =>
    resolvePeriod(initialPeriod) ? initialPeriod : ALL_TIME
  );
  const [activityTops, setActivityTops] = useState<Record<string, string>>(() =>
    Object.fromEntries(ACTIVITIES.map(a => [a, ""]))
  );
  const [overallTop, setOverallTop] = useState("");
  const [tiers, setTiers] = useState<ReportTier[]>([]);

  // Accessible dialog: focus in on open, Escape closes, Tab stays inside, background doesn't scroll,
  // and focus goes back to the trigger on close.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    const returnTo = returnFocusRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      returnTo?.focus();
    };
  }, [returnFocusRef]);

  const invalidRange =
    periodFilter.mode === "custom" &&
    Boolean(periodFilter.start && periodFilter.end) &&
    !isValidPeriod(periodFilter.start, periodFilter.end);
  const incompleteRange = periodFilter.mode === "custom" && !(periodFilter.start && periodFilter.end);
  const period = resolvePeriod(periodFilter);

  const parsedTops = Object.fromEntries(ACTIVITIES.map(a => [a, parseTopN(activityTops[a])]));
  const parsedOverall = parseTopN(overallTop);
  const invalidN = parsedOverall === null || ACTIVITIES.some(a => parsedTops[a] === null);

  const config: OutcomeReportConfig = {
    period,
    activityTops: Object.fromEntries(ACTIVITIES.map(a => [a, parsedTops[a] ?? 0])),
    overallTop: parsedOverall ?? 0,
    tiers,
  };
  const noBlock = !hasReportBlock(config);
  const canDownload = !invalidRange && !incompleteRange && !invalidN && !noBlock;

  const handleDownload = () => {
    if (!canDownload) return;
    const text = formatOutcomeReport(buildOutcomeReport(attendees, records, config), config, new Date());
    downloadText(reportFilename(period), text);
  };

  const toggleTier = (tier: ReportTier) =>
    setTiers(prev => (prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]));

  const fieldClass =
    "bg-white border border-natural-border rounded-xl px-3 py-1.5 text-sm text-[#1A1A1A] focus:outline-none focus-visible:ring-2 focus-visible:ring-natural-forest focus:border-natural-forest aria-[invalid=true]:border-red-700";
  const nInput = (id: string, label: string, value: string, onChange: (v: string) => void) => {
    const invalid = parseTopN(value) === null;
    return (
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-[#1A1A1A]">{label}</label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_TOP_N}
          step={1}
          placeholder="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={`${fieldClass} w-20 text-right`}
        />
        {invalid && (
          <span id={`${id}-error`} className="sr-only">Enter a whole number from 0 to {MAX_TOP_N}.</span>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-[#2D3E35]/45 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
      id="outcome-report-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id="outcome-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="outcome-report-title"
        aria-describedby="outcome-report-desc"
        className="bg-[#FDFBF7] rounded-[32px] border border-natural-border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up"
      >
        <div className="p-6 border-b border-natural-border flex justify-between items-start gap-4 bg-natural-cream/40">
          <div>
            <h2 id="outcome-report-title" className="font-serif font-bold text-[#1A1A1A] text-xl leading-tight">
              Outcome Report
            </h2>
            <p id="outcome-report-desc" className="text-sm text-natural-forest mt-1">
              Choose a period and one or more blocks, then download the report as a .txt file.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Outcome Report"
            className="p-2 text-natural-forest hover:bg-natural-cream rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-natural-forest"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Period (same options as the Dashboard, US-35) */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold text-natural-forest mb-2">Period</legend>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="report-period-mode" className="text-sm font-semibold text-[#1A1A1A]">Range</label>
                <select
                  id="report-period-mode"
                  value={periodFilter.mode}
                  onChange={e => setPeriodFilter({ ...periodFilter, mode: e.target.value as PeriodFilter["mode"] })}
                  className={fieldClass}
                >
                  <option value="all">All time</option>
                  <option value="custom">Custom range</option>
                </select>
              </div>
              {periodFilter.mode === "custom" && (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="report-period-start" className="text-sm font-semibold text-[#1A1A1A]">Start date</label>
                    <input
                      id="report-period-start"
                      type="date"
                      value={periodFilter.start}
                      onChange={e => setPeriodFilter({ ...periodFilter, start: e.target.value })}
                      aria-invalid={invalidRange}
                      aria-describedby={invalidRange ? "report-period-error" : undefined}
                      className={fieldClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="report-period-end" className="text-sm font-semibold text-[#1A1A1A]">End date</label>
                    <input
                      id="report-period-end"
                      type="date"
                      value={periodFilter.end}
                      onChange={e => setPeriodFilter({ ...periodFilter, end: e.target.value })}
                      aria-invalid={invalidRange}
                      aria-describedby={invalidRange ? "report-period-error" : undefined}
                      className={fieldClass}
                    />
                  </div>
                </>
              )}
            </div>
            <p className="text-sm font-semibold text-natural-forest">
              Report period: {period ? formatPeriodLabel(period) : periodFilter.mode === "all" ? "All time" : "—"}
            </p>
            {invalidRange && (
              <p id="report-period-error" role="alert" className="text-sm font-semibold text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                The start date must be on or before the end date.
              </p>
            )}
            {incompleteRange && (
              <p className="text-sm text-natural-forest">Pick a start and an end date.</p>
            )}
          </fieldset>

          {/* Top per activity */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-natural-forest mb-1">Top per activity</legend>
            <p className="text-xs text-natural-forest">How many colleagues to rank in each activity (0 to {MAX_TOP_N}; 0 or empty leaves it out).</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {ACTIVITIES.map((activity, i) =>
                nInput(`report-top-activity-${i}`, activity, activityTops[activity], v =>
                  setActivityTops(prev => ({ ...prev, [activity]: v }))
                )
              )}
            </div>
          </fieldset>

          {/* Top overall */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-natural-forest mb-1">Top overall</legend>
            <p className="text-xs text-natural-forest">Ranks colleagues by their Overall across all activities.</p>
            <div className="sm:w-1/2 sm:pr-3">{nInput("report-top-overall", "Colleagues", overallTop, setOverallTop)}</div>
          </fieldset>

          {/* Hive Status */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-natural-forest mb-1">Hive Status</legend>
            <p className="text-xs text-natural-forest">Lists every colleague in the chosen tiers for the period.</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {REPORT_TIERS.map(tier => (
                <label key={tier} className="inline-flex items-center gap-2 text-sm font-semibold text-[#1A1A1A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tiers.includes(tier)}
                    onChange={() => toggleTier(tier)}
                    className="h-4 w-4 accent-[#2D3E35] focus:outline-none focus-visible:ring-2 focus-visible:ring-natural-forest"
                  />
                  {tier}
                </label>
              ))}
            </div>
          </fieldset>

          {invalidN && (
            <p role="alert" className="text-sm font-semibold text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              Each number must be a whole number from 0 to {MAX_TOP_N}.
            </p>
          )}
          {noBlock && !invalidN && (
            <p id="report-no-block" className="text-sm text-natural-forest">
              Choose at least one block: a ranking above 0 or a Hive Status tier.
            </p>
          )}
        </div>

        <div className="p-4 bg-natural-cream/40 border-t border-natural-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-natural-border text-natural-forest font-bold text-sm rounded-xl transition hover:bg-natural-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-natural-forest"
          >
            Cancel
          </button>
          <button
            type="button"
            id="download-outcome-report"
            onClick={handleDownload}
            disabled={!canDownload}
            aria-describedby={noBlock && !invalidN ? "report-no-block" : undefined}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-natural-forest hover:bg-[#213028] text-white font-bold text-sm rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-natural-forest"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download Report
          </button>
        </div>
      </div>
    </div>
  );
}
