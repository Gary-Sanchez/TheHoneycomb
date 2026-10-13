// @vitest-environment jsdom
import { cloneElement, ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { computeBeehavior, DatePeriod } from "../beehavior";
import type { AttendanceRecord, Attendee } from "../types";
import DashboardPanels from "./DashboardPanels";

// jsdom has no layout, so ResponsiveContainer would measure 0 px and draw no chart at all.
// Give the chart a fixed size instead so the real <svg> renders and can be inspected.
vi.mock("recharts", async importOriginal => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 600, height: 300 }),
  };
});

beforeAll(() => {
  // Recharts observes its wrapper's size; jsdom doesn't implement ResizeObserver
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const attendee = (id: string, enrolledActivities: string[]): Attendee => ({
  id,
  name: id,
  enrolledActivities,
  joinedDate: "2026-01-01",
});

let seq = 0;
const rec = (attendeeId: string, activity: string, date: string): AttendanceRecord => ({
  id: `r${seq++}`,
  attendeeId,
  attendeeName: attendeeId,
  activity,
  date,
  status: "present",
});

// Speakeasy in January and April only: February and March have no events
const attendees = [attendee("ana", ["Speakeasy"]), attendee("bea", ["Speakeasy"])];
const records = [
  rec("ana", "Speakeasy", "2026-01-05"),
  rec("bea", "Speakeasy", "2026-01-05"),
  rec("ana", "Speakeasy", "2026-04-06"),
];

const renderPanels = (period: DatePeriod | null) => (
  <DashboardPanels
    attendees={attendees}
    allRecords={records}
    period={period}
    rows={computeBeehavior(attendees, records, period)}
    periodHasNoEvents={false}
    emptyMessage="No events in this period"
  />
);

const header = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const contentOf = (button: HTMLElement) => document.getElementById(button.getAttribute("aria-controls") as string)!;

describe("US-36: DashboardPanels accordion", () => {
  it("QA-01: three panels, only Attendance Trends open", () => {
    render(renderPanels(null));

    const trends = header("Attendance Trends");
    const comparison = header("Cross-Activity Comparisons");
    const engagement = header("Engagement");

    expect(trends.getAttribute("aria-expanded")).toBe("true");
    expect(comparison.getAttribute("aria-expanded")).toBe("false");
    expect(engagement.getAttribute("aria-expanded")).toBe("false");

    expect(contentOf(trends).hidden).toBe(false);
    expect(contentOf(comparison).hidden).toBe(true);
    expect(contentOf(engagement).hidden).toBe(true);
    expect(screen.queryByText("Q2 Year 2026")).toBeNull();
  });

  it("QA-08: each header is a native <button> wired to its region via aria-controls", () => {
    render(renderPanels(null));

    for (const name of ["Attendance Trends", "Cross-Activity Comparisons", "Engagement"]) {
      const button = header(name);
      // A native type="button" is what makes Enter and Space toggle it
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");

      const region = contentOf(button);
      expect(region).not.toBeNull();
      expect(region.getAttribute("role")).toBe("region");
      expect(region.getAttribute("aria-labelledby")).toBe(button.id);
    }
  });

  it("a click opens and closes a panel", () => {
    render(renderPanels(null));
    const comparison = header("Cross-Activity Comparisons");

    fireEvent.click(comparison);
    expect(comparison.getAttribute("aria-expanded")).toBe("true");
    expect(contentOf(comparison).hidden).toBe(false);

    fireEvent.click(comparison);
    expect(comparison.getAttribute("aria-expanded")).toBe("false");
    expect(contentOf(comparison).hidden).toBe(true);
  });

  it("QA-06: open/closed state survives a period change and the numbers recalculate", () => {
    const { rerender } = render(renderPanels(null));
    fireEvent.click(header("Engagement"));
    fireEvent.click(header("Attendance Trends"));

    const newSpeakeasy = () =>
      within(document.getElementById("engagement-new")!).getByRole("row", { name: /Speakeasy/ });
    expect(within(newSpeakeasy()).getByText("2")).toBeTruthy();

    // April only: bea never attends, ana's first attendance was in January
    rerender(renderPanels({ start: "2026-04-01", end: "2026-04-30" }));

    expect(header("Attendance Trends").getAttribute("aria-expanded")).toBe("false");
    expect(header("Cross-Activity Comparisons").getAttribute("aria-expanded")).toBe("false");
    expect(header("Engagement").getAttribute("aria-expanded")).toBe("true");
    expect(within(newSpeakeasy()).getByText("0")).toBeTruthy();
  });

  it("QA-07: a month without events is No data, never 0%", () => {
    render(renderPanels(null));

    const march = within(document.getElementById("trends-table")!).getByRole("row", { name: /Mar 2026/ });
    expect(within(march).getAllByText("No data").length).toBeGreaterThan(0);
    expect(march.textContent).not.toContain("0%");

    const chart = within(contentOf(header("Attendance Trends"))).getByRole("img");
    expect(chart.getAttribute("aria-label")).toContain("Mar 2026 no data");
  });

  it("QA-08: every chart is one described role=img with no unnamed Tab stop inside", () => {
    render(renderPanels(null));
    fireEvent.click(header("Cross-Activity Comparisons"));
    fireEvent.click(header("Engagement"));

    const charts = screen.getAllByRole("img");
    expect(charts).toHaveLength(3);

    for (const chart of charts) {
      expect(chart.getAttribute("aria-label")).toBeTruthy();
      // The chart really rendered (otherwise the checks below would pass vacuously)
      expect(chart.querySelector("svg.recharts-surface")).not.toBeNull();
      // Recharts' accessibilityLayer would add <svg tabindex="0" role="application"> with no name
      // (tabindex="-1", e.g. the hidden tooltip, is not a Tab stop)
      const tabStops = [...chart.querySelectorAll("[tabindex]")].filter(el => Number(el.getAttribute("tabindex")) >= 0);
      expect(tabStops).toEqual([]);
      expect(chart.querySelector('[role="application"]')).toBeNull();
    }
  });
});
