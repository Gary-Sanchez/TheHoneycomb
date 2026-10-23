// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import DataTable from "./DataTable";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";
import Stat from "./Stat";

afterEach(cleanup);

const rows = [
  { name: "Ana Pérez", speakeasy: "80%", reading: "No data" },
  { name: "Bea Ruiz", speakeasy: "50%", reading: "100%" },
];
const columns = [
  { key: "name", header: "Colleague" },
  { key: "speakeasy", header: "Speakeasy", align: "right" as const },
  { key: "reading", header: "Reading Club", align: "right" as const },
];

describe("US-61: DataTable dense", () => {
  it("tighter padding and wrapping headers; body cells stay on one line; default unchanged", () => {
    render(<DataTable caption="Dense" dense columns={columns} rows={rows} getRowKey={r => r.name} />);
    const header = screen.getAllByRole("columnheader")[0];
    expect(header.className).toContain("px-2.5");
    expect(header.className).toContain("whitespace-normal");
    expect(header.className).not.toContain("whitespace-nowrap");
    const cell = screen.getByRole("rowheader", { name: "Ana Pérez" });
    expect(cell.className).toContain("px-2.5");
    expect(cell.className).toContain("whitespace-nowrap");
    cleanup();

    render(<DataTable caption="Default" columns={columns} rows={rows} getRowKey={r => r.name} />);
    const defaultHeader = screen.getAllByRole("columnheader")[0];
    expect(defaultHeader.className).toContain("px-4");
    expect(defaultHeader.className).toContain("whitespace-nowrap");
  });
});

describe("US-57: DataTable", () => {
  it("own horizontal scroll: a focusable region named by the caption", () => {
    render(<DataTable caption="Attendance by colleague" columns={columns} rows={rows} getRowKey={r => r.name} />);
    const region = screen.getByRole("region", { name: "Attendance by colleague" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("overflow-x-auto");
    expect(region.className).toContain("focus-ring-inset");
    expect(screen.getByRole("table", { name: "Attendance by colleague" })).toBeTruthy();
  });

  it("scope=col headers (sticky, opaque) and scope=row row headers; row hover", () => {
    render(<DataTable caption="Attendance" columns={columns} rows={rows} getRowKey={r => r.name} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map(h => h.getAttribute("scope"))).toEqual(["col", "col", "col"]);
    for (const h of headers) {
      expect(h.className).toContain("sticky");
      expect(h.className).toContain("top-0");
      expect(h.className).toContain("bg-cream");
    }
    const rowHeader = screen.getByRole("rowheader", { name: "Ana Pérez" });
    expect(rowHeader.getAttribute("scope")).toBe("row");
    expect(rowHeader.className).toContain("group-hover:bg-wheat");
  });

  it("hideCaption keeps it for assistive tech only; stickyFirstColumn pins the first column", () => {
    render(<DataTable caption="Attendance" hideCaption stickyFirstColumn columns={columns} rows={rows} getRowKey={r => r.name} />);
    expect(document.querySelector("caption")?.className).toBe("sr-only");
    expect(screen.getByRole("rowheader", { name: "Bea Ruiz" }).className).toContain("left-0");
    expect(screen.getAllByRole("columnheader")[0].className).toContain("left-0");
  });

  it("the visible title sits outside the scroll region, so it never scrolls away (QA #71)", () => {
    render(<DataTable caption="Attendance" columns={columns} rows={rows} getRowKey={r => r.name} />);
    const region = screen.getByRole("region", { name: "Attendance" });
    const title = screen.getByText("Attendance", { selector: "p" });
    expect(region.contains(title)).toBe(false);
    expect(title.getAttribute("aria-hidden")).toBe("true");
    // The table keeps its real caption for assistive tech
    expect(document.querySelector("caption")?.className).toBe("sr-only");
    expect(screen.getByRole("table", { name: "Attendance" })).toBeTruthy();
  });

  it("no rows: a single row with the empty message", () => {
    render(<DataTable caption="Attendance" columns={columns} rows={[]} getRowKey={() => ""} emptyMessage="No colleagues yet" />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("No colleagues yet").getAttribute("colspan")).toBe("3");
  });
});

describe("US-57: EmptyState, PageHeader, Stat", () => {
  it("EmptyState: heading (h3 by default), description and action", () => {
    render(<EmptyState title="No attendance yet" description="Import a log to start." action={<button type="button">Import</button>} />);
    expect(screen.getByRole("heading", { level: 3, name: "No attendance yet" })).toBeTruthy();
    expect(screen.getByText("Import a log to start.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
  });

  it("PageHeader renders the tab's h2", () => {
    render(<PageHeader title="Dashboard" headingId="dash-title" description="Reference date June 24, 2026" />);
    expect(screen.getByRole("heading", { level: 2, name: "Dashboard" }).id).toBe("dash-title");
  });

  it("Stat is a dl / dt / dd, not a heading", () => {
    const { container } = render(<Stat label="Total Caserits" value="42" hint="+3 since May" />);
    expect(screen.queryByRole("heading")).toBeNull();
    const dl = container.querySelector("dl")!;
    expect(dl.querySelector("dt")?.textContent).toBe("Total Caserits");
    expect([...dl.querySelectorAll("dd")].map(d => d.textContent)).toEqual(["42", "+3 since May"]);
  });
});
