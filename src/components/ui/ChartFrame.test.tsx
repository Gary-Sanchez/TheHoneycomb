// @vitest-environment jsdom
import { cloneElement, ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ChartFrame, { chartAriaLabel, formatChartValue, tooltipFormatter, type ChartDatum } from "./ChartFrame";

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

  it("bar kind labels a missing month No data on the chart itself, so it can't pass for 0% (QA #71)", () => {
    const { container } = render(<ChartFrame title="By month" kind="bar" data={data} series={series} />);
    const labels = [...container.querySelectorAll("svg text.chart-no-data")];
    expect(labels.map(l => l.textContent)).toEqual(["No data"]);
  });

  it("the tooltip says No data for a gap, also in bar mode where it's plotted at 0 (QA #71)", () => {
    // jsdom can't hover a Recharts chart; filterNull={false} on the Tooltip is what lets the
    // formatter see the null entries at all (checked in the browser on the examples page)
    const format = tooltipFormatter(series);
    expect(format(null, "Attendance rate", { payload: data[1] })).toBe("No data");
    expect(format(0, "Attendance rate", { payload: data[1] })).toBe("No data");
    expect(format(80, "Attendance rate", { payload: data[0] })).toBe("80%");
    expect(format(75, "Goal")).toBe("75%");
  });

  it("values are rounded to whole percents", () => {
    expect(formatChartValue(66.6667)).toBe("67%");
    expect(formatChartValue(null)).toBe("No data");
  });

  it("US-61: hideTitle keeps the title for assistive tech only; ariaLabel overrides the generated one", () => {
    const { container } = render(<ChartFrame title="Attendance Trends" hideTitle ariaLabel="Custom label" data={data} series={series} hideTable />);
    expect(container.querySelector("figcaption")?.className).toBe("sr-only");
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Custom label");
  });

  it("US-61: count format plots plain integers (no %, no 0–100 axis) in ticks, table and aria-label", () => {
    const counts: ChartDatum[] = [
      { label: "Dormant", count: 3 },
      { label: "Busy Bee", count: 1 },
    ];
    const countSeries = [{ key: "count", name: "Colleagues" }];
    const { container } = render(<ChartFrame title="Colleagues per Hive Status" kind="bar" valueFormat="count" data={counts} series={countSeries} />);
    const ticks = [...container.querySelectorAll("text.recharts-cartesian-axis-tick-value")].map(t => t.textContent);
    expect(ticks.some(t => t?.endsWith("%"))).toBe(false);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Colleagues per Hive Status. Colleagues: Dormant 3, Busy Bee 1.");
    expect(within(screen.getByRole("table")).getByRole("rowheader", { name: "Dormant" }).parentElement?.textContent).toBe("Dormant3");
    expect(tooltipFormatter(countSeries, "count")(3, "Colleagues", { payload: counts[0] })).toBe("3");
  });

  it("bar kind renders bars; empty data reads No data", () => {
    const { container } = render(<ChartFrame title="By activity" kind="bar" data={data} series={series} />);
    expect(container.querySelector(".recharts-bar")).not.toBeNull();
    expect(chartAriaLabel("Empty", [], series)).toBe("Empty. No data.");
  });
});
