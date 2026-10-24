// @vitest-environment jsdom
import { cloneElement, ReactElement } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ALL_TIME, type PeriodFilter } from "../beehavior";
import type { AttendanceRecord, Attendee } from "../types";
import DashboardStats from "./DashboardStats";

// jsdom has no layout: give the panels' charts a fixed size (as in DashboardPanels.test)
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

const attendee = (id: string, name: string): Attendee => ({ id, name, email: `${id}@example.com`, enrolledActivities: ["Speakeasy"], joinedDate: "2026-01-01" });
const rec = (id: string, attendeeId: string, activity: string, date: string): AttendanceRecord => ({
  id,
  attendeeId,
  attendeeName: attendeeId,
  activity,
  date,
  status: "present",
});

const attendees = [attendee("ana", "Ana Pérez"), attendee("bea", "Bea Ruiz")];
const records = [
  rec("r1", "ana", "Speakeasy", "2026-01-05"),
  rec("r2", "bea", "Speakeasy", "2026-01-05"),
  rec("r3", "ana", "Reading Club", "2026-01-12"),
];

const renderDashboard = (props: { attendees?: Attendee[]; records?: AttendanceRecord[]; periodFilter?: PeriodFilter; onNavigate?: (tab: string) => void } = {}) =>
  render(
    <DashboardStats
      attendees={props.attendees ?? attendees}
      records={props.records ?? records}
      periodFilter={props.periodFilter ?? ALL_TIME}
      onPeriodFilterChange={() => {}}
      onNavigate={props.onNavigate ?? (() => {})}
    />
  );

describe("US-61: Dashboard accessible and responsive", () => {
  it("KPIs are Stat description lists (no headings) in a 1 → 2 → 4 grid", () => {
    renderDashboard();
    for (const id of ["kpi-total-attendees", "kpi-attendance-rate", "kpi-multi-enrollment"]) {
      const kpi = document.getElementById(id)!;
      expect(kpi.tagName).toBe("DL");
      expect(kpi.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    }
    const total = document.getElementById("kpi-total-attendees")!;
    expect(total.querySelector("dt")?.textContent).toBe("Total Caserits");
    expect(total.querySelectorAll("dd")[0].textContent).toBe("2");
    expect(total.querySelectorAll("dd")[1].textContent).toBe("Active across all activities");
    expect(document.getElementById("kpi-multi-enrollment")!.querySelectorAll("dd")[1].textContent).toBe("1 colleague in 2+ activities");
    expect(document.getElementById("kpi-attendance-rate-value")?.closest("dd")).not.toBeNull();

    const grid = total.parentElement!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("sm:grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-4");
  });

  it("the Import Forage Logs card is a native button that opens the parser tab", () => {
    const onNavigate = vi.fn();
    renderDashboard({ onNavigate });
    const card = screen.getByRole("button", { name: "Open Import Forage Logs" });
    expect(card.tagName).toBe("BUTTON");
    expect(card.getAttribute("type")).toBe("button");
    expect(card.id).toBe("kpi-quick-parse");
    fireEvent.click(card);
    expect(onNavigate).toHaveBeenCalledWith("parser");
  });

  it("the Hub is a scrollable DataTable with every column and the name pinned (BUG-11)", () => {
    renderDashboard();
    const region = screen.getByRole("region", { name: "Caserits Bee-havior Hub" });
    expect(region.className).toContain("overflow-x-auto");
    const table = within(region).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual([
      "Caserits",
      "Speakeasy",
      "Reading Club",
      "Music Room",
      "Writing Hood",
      "Overall",
      "Hive Status",
      "Multi-Activity",
    ]);
    const ana = within(table).getByRole("rowheader", { name: /Ana Pérez/ });
    expect(ana.className).toContain("sticky");
    expect(ana.className).toContain("left-0");
    // Compact enough to fit 1440 px without scrolling: dense cells, wrapping headers and email
    expect(within(table).getAllByRole("columnheader")[1].className).toContain("whitespace-normal");
    expect(within(ana).getByText(/@/).className).toContain("break-all");
    const row = ana.parentElement!;
    expect(within(row).getByTestId("hive-status")).toBeTruthy();
    expect(row.textContent).toContain("Yes (2 Activities)");
  });

  it("the Activities Matrix pill stays on one line", () => {
    renderDashboard();
    const pill = screen.getByText("Activity 1").closest("span")!;
    expect(pill.className).toContain("whitespace-nowrap");
  });

  it("empty Hub: no colleagues vs. a search with no matches", () => {
    renderDashboard({ attendees: [], records: [] });
    expect(screen.getByRole("heading", { name: "No colleagues yet." })).toBeTruthy();
    cleanup();

    renderDashboard();
    fireEvent.change(screen.getByLabelText("Search Caserits"), { target: { value: "zzz" } });
    expect(screen.getByRole("heading", { name: "No colleagues match your search." })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No colleagues yet." })).toBeNull();
    expect(screen.queryByRole("region", { name: "Caserits Bee-havior Hub" })).toBeNull();
  });

  it("no pixel text sizes, arbitrary hex or raw palette colors left in the Dashboard sources", () => {
    for (const file of ["DashboardStats.tsx", "DashboardPanels.tsx"]) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source, file).not.toMatch(/text-\[\d+px\]/);
      expect(source, file).not.toMatch(/(bg|text|border)-\[#/);
      expect(source, file).not.toMatch(/rounded(-[a-z]+)?-\[/);
      // sage / sand fills are not text colors on light backgrounds
      expect(source, file).not.toMatch(/text-natural-(sage|sand)\b(?!.*aria-hidden)/);
    }
  });
});
