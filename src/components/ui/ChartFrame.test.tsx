// @vitest-environment jsdom
import { cloneElement, ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ChartFrame, { chartAriaLabel, type ChartDatum } from "./ChartFrame";

// jsdom has no layout: give the chart a fixed size so the real <svg> renders (as in DashboardPanels.test)
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

const data: ChartDatum[] = [
  { label: "Jan", rate: 80 },
  { label: "Feb", rate: null },
  { label: "Mar", rate: 60 },
];
const series = [{ key: "rate", name: "Attendance rate" }];

describe("US-57: ChartFrame", () => {
  it("role=img with an aria-label that lists every point and says No data for gaps", () => {
    render(<ChartFrame title="Monthly attendance" data={data} series={series} />);
    const img = screen.getByRole("img", { name: /Monthly attendance/ });
    expect(img.getAttribute("aria-label")).toBe("Monthly attendance. Attendance rate: Jan 80%, Feb No data, Mar 60%.");
  });

  it("percent axis 0–100 with %, a legend of the real series, no focusable application svg", () => {
    const { container } = render(<ChartFrame title="Monthly attendance" data={data} series={series} />);
    const ticks = [...container.querySelectorAll("text.recharts-cartesian-axis-tick-value")].map(t => t.textContent).filter(t => t?.endsWith("%"));
    expect(ticks).toEqual(["0%", "25%", "50%", "75%", "100%"]);
    expect(container.querySelector(".recharts-legend-wrapper")?.textContent).toContain("Attendance rate");
    expect(container.querySelector("svg[role=application]")).toBeNull();
  });

  it("a missing month is a gap: the line is split, never drawn down to 0%", () => {
    const { container } = render(<ChartFrame title="Monthly attendance" data={data} series={series} />);
    // connectNulls={false}: one move-to per segment, one segment on each side of February
    const d = container.querySelector(".recharts-line-curve")?.getAttribute("d") ?? "";
    expect(d.match(/M/g)?.length).toBe(2);
  });

  it("the alternative table carries the same data, with scope headers and No data", () => {
    render(<ChartFrame title="Monthly attendance" data={data} series={series} labelHeader="Month" />);
    const table = screen.getByRole("table", { name: "Monthly attendance (data table)" });
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["Month", "Attendance rate"]);
    expect(within(table).getByRole("rowheader", { name: "Feb" }).parentElement?.textContent).toBe("FebNo data");
    expect(within(table).getByRole("rowheader", { name: "Jan" }).parentElement?.textContent).toBe("Jan80%");
  });

  it("bar kind renders bars; empty data reads No data", () => {
    const { container } = render(<ChartFrame title="By activity" kind="bar" data={data} series={series} />);
    expect(container.querySelector(".recharts-bar")).not.toBeNull();
    expect(chartAriaLabel("Empty", [], series)).toBe("Empty. No data.");
  });
});
