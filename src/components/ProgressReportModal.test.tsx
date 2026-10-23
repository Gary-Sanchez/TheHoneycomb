// @vitest-environment jsdom
import { cloneElement, ReactElement, useRef, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AttendanceRecord, Attendee } from "../types";
import { ALL_TIME } from "../beehavior";
import ProgressReportModal from "./ProgressReportModal";
import OutcomeReportModal from "./OutcomeReportModal";

// jsdom has no layout: give the chart a fixed size so the real <svg> renders (same as DashboardPanels.test)
vi.mock("recharts", async importOriginal => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 600, height: 300 }),
  };
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const ana: Attendee = { id: "ana", name: "Ana Pérez", email: "ana@example.com", enrolledActivities: ["Speakeasy"], joinedDate: "2026-01-01" };
const bea: Attendee = { id: "bea", name: "Bea Ruiz", enrolledActivities: ["Speakeasy"], joinedDate: "2026-01-01" };

let seq = 0;
const rec = (attendee: Attendee, date: string): AttendanceRecord => ({
  id: `r${seq++}`,
  attendeeId: attendee.id,
  attendeeName: attendee.name,
  activity: "Speakeasy",
  date,
  status: "present",
});

// Bea attends January, misses April (Ana attends it): Jan 100 %, Apr 0 %, Overall 50 %
const records = [rec(ana, "2026-01-05"), rec(bea, "2026-01-05"), rec(ana, "2026-04-06")];

function Harness({ canEdit = true, onClose }: { canEdit?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Progress Report
      </button>
      {open && (
        <ProgressReportModal
          attendee={bea}
          records={records}
          notes="Keep going"
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
          onSaveNotes={() => {}}
          canEdit={canEdit}
        />
      )}
    </>
  );
}

const openReport = () => {
  const trigger = screen.getByRole("button", { name: "Progress Report" });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("dialog") };
};

describe("US-64: Progress Report as a Dialog", () => {
  it("QA-01: is a modal dialog named by the colleague, focus goes in, Escape closes and focus returns to the trigger", () => {
    render(<Harness />);
    const { trigger, dialog } = openReport();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Bea Ruiz" })).toBe(dialog);
    expect(dialog.id).toBe("progress-report-modal");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close progress report" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("the close button, Close Report and a click outside close it", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openReport();
    fireEvent.click(screen.getByRole("button", { name: "Close progress report" }));
    openReport();
    fireEvent.click(screen.getByRole("button", { name: "Close Report" }));
    const { dialog } = openReport();
    fireEvent.mouseDown(dialog); // inside: stays open
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("QA-02: the page behind doesn't scroll while it is open", () => {
    render(<Harness />);
    openReport();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });

  it("QA-03: one scroll area (the dialog body), a dvh height and no nested scroll in the history", () => {
    render(<Harness />);
    const { dialog } = openReport();
    expect(dialog.className).toContain("max-h-[90dvh]");
    expect(dialog.querySelectorAll(".overflow-y-auto")).toHaveLength(1);
    expect(dialog.querySelector('[class*="max-h-"]:not([role="dialog"])')).toBeNull();
  });

  it("QA-04: the monthly chart is a ChartFrame — role=img summarising each month with %, no table", () => {
    render(<Harness />);
    const { dialog } = openReport();
    const chart = within(dialog).getByRole("img", { name: /Monthly Trends Progress/ });
    expect(chart.getAttribute("aria-label")).toBe("Monthly Trends Progress. Attendance (%): Jan 100%, Apr 0%.");
    expect(within(dialog).getByText("Monthly Trends Progress").tagName).toBe("FIGCAPTION");
    expect(within(dialog).queryByRole("table")).toBeNull();
    // Y axis 0–100 with "%"
    for (const tick of ["0%", "25%", "50%", "75%", "100%"]) expect(dialog.textContent).toContain(tick);
  });

  it("QA-06: rates, counts, dates and copy are the ones the 4.0 report showed", () => {
    render(<Harness />);
    const { dialog } = openReport();
    expect(within(dialog).getByText("50%", { selector: "span.font-serif" })).toBeTruthy();
    expect(dialog.textContent).toContain("Present: 1");
    expect(dialog.textContent).toContain("Absent: 1");
    expect(dialog.textContent).toContain("Records: 2");
    expect(dialog.textContent).toContain("No email registered");
    expect(dialog.textContent).toContain("Attended 1 of 2 events");
    // dates in the US-58 format, newest first
    const dates = [...dialog.querySelectorAll("li p.font-mono")].map(p => p.textContent);
    expect(dates).toEqual(["Jan 5, 2026"]);
    expect(within(dialog).getByText("Present", { selector: "li span" })).toBeTruthy();
  });

  it("Hive Status is the shared TierBadge and each activity shows its icon", () => {
    render(<Harness />);
    const { dialog } = openReport();
    const badge = within(dialog).getByTestId("hive-status");
    expect(badge.getAttribute("data-tier")).toBe("hatcher");
    expect(badge.textContent).toContain("Hatcher");
    const speakeasy = within(dialog).getAllByText("Speakeasy").find(el => el.tagName === "SPAN" && el.querySelector("svg"));
    expect(speakeasy?.className).toContain("text-activity-speakeasy-text");
    expect(speakeasy?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("the notes textarea is labelled by a Field and is read-only without admin access", () => {
    render(<Harness canEdit={false} />);
    openReport();
    const notes = screen.getByLabelText("Coaching notes") as HTMLTextAreaElement;
    expect(notes.value).toBe("Keep going");
    expect(notes.readOnly).toBe(true);
    expect((screen.getByRole("button", { name: "Save Notes" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Read-only. Sign in as admin in Settings to edit notes.")).toBeTruthy();
  });
});

describe("US-64: Outcome Report on the shared Dialog", () => {
  function OutcomeHarness() {
    const [open, setOpen] = useState(false);
    const btn = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button type="button" ref={btn} onClick={() => setOpen(true)}>
          Generate Outcome Report
        </button>
        {open && (
          <OutcomeReportModal
            attendees={[ana, bea]}
            records={records}
            initialPeriod={ALL_TIME}
            onClose={() => setOpen(false)}
            returnFocusRef={btn}
          />
        )}
      </>
    );
  }

  it("QA-05: focus in, Escape closes and focus returns to the Generate button", () => {
    render(<OutcomeHarness />);
    const trigger = screen.getByRole("button", { name: "Generate Outcome Report" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Outcome Report" });
    expect(dialog.id).toBe("outcome-report-modal");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(dialog.textContent).toContain("Choose a period and one or more blocks, then download the report as a .txt file.");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps its behavior: Download stays disabled until a block is chosen", () => {
    render(<OutcomeHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Outcome Report" }));
    const download = screen.getByRole("button", { name: "Download Report" }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    expect(screen.getByText("Choose at least one block: a ranking above 0 or a Hive Status tier.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Dormant"));
    expect(download.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Speakeasy"), { target: { value: "5e" } });
    expect(screen.getByRole("alert").textContent).toContain("Each number must be a whole number from 0 to");
    expect(download.disabled).toBe(true);
  });
});
