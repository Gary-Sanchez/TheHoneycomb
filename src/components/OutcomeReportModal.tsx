import { useState, RefObject } from "react";
import { Download } from "lucide-react";
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
import { Alert, Button, DateInput, Dialog, Input, Select } from "./ui";

// US-64: same content and behavior as the 4.0 modal, now on the shared Dialog (US-57), which brings
// the focus handling this file used to hand-roll (focus in, Escape, Tab wrap, scroll lock, focus
// back to the Generate Outcome Report button through returnFocusRef).

interface OutcomeReportModalProps {
  attendees: Attendee[];
  records: AttendanceRecord[];
  // The Dashboard's period filter; the panel starts on the period the Dashboard is applying
  initialPeriod: PeriodFilter;
  onClose: () => void;
  // The Generate Outcome Report button, focused again when the dialog closes
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

type ChangeEvent = { target: { value: string } };

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
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() =>
    resolvePeriod(initialPeriod) ? initialPeriod : ALL_TIME
  );
  const [activityTops, setActivityTops] = useState<Record<string, string>>(() =>
    Object.fromEntries(ACTIVITIES.map(a => [a, ""]))
  );
  const [overallTop, setOverallTop] = useState("");
  const [tiers, setTiers] = useState<ReportTier[]>([]);

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

  const nInput = (id: string, label: string, value: string, onChange: (v: string) => void) => {
    const invalid = parseTopN(value) === null;
    return (
      <div key={id} className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-body font-semibold text-forest">{label}</label>
        {/* Text, not type="number": a number input reports "" for a bad entry like "5e", which
            parseTopN would read as 0 (left out) instead of invalid. */}
        <div className="w-20">
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={value}
            onChange={(e: ChangeEvent) => onChange(e.target.value)}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            className="text-right"
          />
        </div>
        {invalid && (
          <span id={`${id}-error`} className="sr-only">Enter a whole number from 0 to {MAX_TOP_N}.</span>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      id="outcome-report-modal"
      size="lg"
      className="sm:max-w-2xl"
      returnFocusRef={returnFocusRef}
      closeLabel="Close Outcome Report"
      title="Outcome Report"
      description="Choose a period and one or more blocks, then download the report as a .txt file."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            id="download-outcome-report"
            onClick={handleDownload}
            disabled={!canDownload}
            aria-describedby={noBlock && !invalidN ? "report-no-block" : undefined}
            icon={<Download className="size-4" />}
          >
            Download Report
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Period (same options as the Dashboard, US-35) */}
        <fieldset className="space-y-3">
          <legend className="mb-2 text-body font-bold text-forest">Period</legend>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="report-period-mode" className="text-body font-semibold text-forest">Range</label>
              <Select
                id="report-period-mode"
                value={periodFilter.mode}
                onChange={(e: ChangeEvent) => setPeriodFilter({ ...periodFilter, mode: e.target.value as PeriodFilter["mode"] })}
              >
                <option value="all">All time</option>
                <option value="custom">Custom range</option>
              </Select>
            </div>
            {periodFilter.mode === "custom" && (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor="report-period-start" className="text-body font-semibold text-forest">Start date</label>
                  <DateInput
                    id="report-period-start"
                    value={periodFilter.start}
                    onChange={(e: ChangeEvent) => setPeriodFilter({ ...periodFilter, start: e.target.value })}
                    aria-invalid={invalidRange}
                    aria-describedby={invalidRange ? "report-period-error" : undefined}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="report-period-end" className="text-body font-semibold text-forest">End date</label>
                  <DateInput
                    id="report-period-end"
                    value={periodFilter.end}
                    onChange={(e: ChangeEvent) => setPeriodFilter({ ...periodFilter, end: e.target.value })}
                    aria-invalid={invalidRange}
                    aria-describedby={invalidRange ? "report-period-error" : undefined}
                  />
                </div>
              </>
            )}
          </div>
          <p className="text-body font-semibold text-forest">
            Report period: {period ? formatPeriodLabel(period) : periodFilter.mode === "all" ? "All time" : "—"}
          </p>
          {invalidRange && (
            <Alert tone="danger" id="report-period-error">
              The start date must be on or before the end date.
            </Alert>
          )}
          {incompleteRange && (
            <p className="text-body text-forest">Pick a start and an end date.</p>
          )}
        </fieldset>

        {/* Top per activity */}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-body font-bold text-forest">Top per activity</legend>
          <p className="text-micro text-forest">How many colleagues to rank in each activity (0 to {MAX_TOP_N}; 0 or empty leaves it out).</p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {ACTIVITIES.map((activity, i) =>
              nInput(`report-top-activity-${i}`, activity, activityTops[activity], v =>
                setActivityTops(prev => ({ ...prev, [activity]: v }))
              )
            )}
          </div>
        </fieldset>

        {/* Top overall */}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-body font-bold text-forest">Top overall</legend>
          <p className="text-micro text-forest">Ranks colleagues by their Overall across all activities.</p>
          <div className="sm:w-1/2 sm:pr-3">{nInput("report-top-overall", "Colleagues", overallTop, setOverallTop)}</div>
        </fieldset>

        {/* Hive Status */}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-body font-bold text-forest">Hive Status</legend>
          <p className="text-micro text-forest">Lists every colleague in the chosen tiers for the period.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {REPORT_TIERS.map(tier => (
              <label key={tier} className="inline-flex cursor-pointer items-center gap-2 text-body font-semibold text-forest">
                <input
                  type="checkbox"
                  checked={tiers.includes(tier)}
                  onChange={() => toggleTier(tier)}
                  className="size-4 accent-forest"
                />
                {tier}
              </label>
            ))}
          </div>
        </fieldset>

        {invalidN && (
          <Alert tone="danger">
            Each number must be a whole number from 0 to {MAX_TOP_N}.
          </Alert>
        )}
        {noBlock && !invalidN && (
          <p id="report-no-block" className="text-body text-forest">
            Choose at least one block: a ranking above 0 or a Hive Status tier.
          </p>
        )}
      </div>
    </Dialog>
  );
}
