// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SegmentedControl from "./SegmentedControl";
import Tabs from "./Tabs";

afterEach(cleanup);

const TABS = [
  { id: "dashboard", label: "Dashboard", content: <p>Dashboard content</p> },
  { id: "checkin", label: "Manual Check-In", content: <p>Check-in content</p> },
  { id: "import", label: "Import Forage Logs", content: <p>Import content</p> },
];

const tab = (name: string) => screen.getByRole("tab", { name });

describe("US-57: Tabs", () => {
  it("tablist / tab / tabpanel wired with aria-selected, aria-controls and aria-labelledby", () => {
    render(<Tabs label="Sections" tabs={TABS} />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeTruthy();
    const first = tab("Dashboard");
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(tab("Manual Check-In").getAttribute("aria-selected")).toBe("false");
    const panel = screen.getByRole("tabpanel");
    expect(first.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(first.id);
    expect(panel.textContent).toBe("Dashboard content");
    // Every tab's aria-controls points at a panel that exists
    for (const t of screen.getAllByRole("tab")) expect(document.getElementById(t.getAttribute("aria-controls")!)).not.toBeNull();
  });

  it("roving tabindex: only the selected tab is tabbable", () => {
    render(<Tabs label="Sections" tabs={TABS} defaultValue="checkin" />);
    expect(screen.getAllByRole("tab").map(t => t.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("Arrow Right / Left wrap and Home / End jump; selection follows focus", () => {
    render(<Tabs label="Sections" tabs={TABS} />);
    const first = tab("Dashboard");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Manual Check-In"));
    expect(tab("Manual Check-In").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Check-in content");

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(tab("Import Forage Logs"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Dashboard"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab("Import Forage Logs"));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(tab("Dashboard"));
    expect(tab("Dashboard").getAttribute("tabindex")).toBe("0");
    expect(tab("Import Forage Logs").getAttribute("tabindex")).toBe("-1");
  });

  it("controlled: follows value and reports changes", () => {
    const onValueChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState("import");
      return (
        <Tabs
          label="Sections"
          tabs={TABS}
          value={value}
          onValueChange={id => {
            onValueChange(id);
            setValue(id);
          }}
        />
      );
    }
    render(<Controlled />);
    expect(tab("Import Forage Logs").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tab("Dashboard"));
    expect(onValueChange).toHaveBeenCalledWith("dashboard");
    expect(tab("Dashboard").getAttribute("aria-selected")).toBe("true");
  });

  it("no 1 px jump: every tab keeps the 2 px border and one font weight", () => {
    render(<Tabs label="Sections" tabs={TABS} />);
    for (const t of screen.getAllByRole("tab")) {
      expect(t.className).toContain("border-b-2");
      expect(t.className).toContain("font-semibold");
    }
  });

  it("the selected indicator stays inside the scrolling tablist (QA #71): no -mb-px, no vertical overflow", () => {
    render(<Tabs label="Sections" tabs={TABS} />);
    const tablist = screen.getByRole("tablist").className.split(" ");
    expect(tablist).toContain("overflow-x-auto");
    expect(tablist).toContain("overflow-y-hidden");
    // The baseline is an inset shadow, so it isn't a border the tabs have to overlap with -1px
    expect(tablist).not.toContain("border-b");
    expect(tablist.some(c => c.startsWith("shadow-[inset"))).toBe(true);
    for (const t of screen.getAllByRole("tab")) expect(t.className.split(" ")).not.toContain("-mb-px");
  });
});

describe("US-59: Tabs in the app shell", () => {
  it("renderList / renderPanels wrap the list and the panels separately", () => {
    render(
      <Tabs
        label="Sections"
        tabs={TABS}
        renderList={list => <nav aria-label="Main">{list}</nav>}
        renderPanels={panels => <main>{panels}</main>}
      />
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelector("[role=tablist]")).not.toBeNull();
    expect(nav.querySelector("[role=tabpanel]")).toBeNull();
    expect(screen.getByRole("main").querySelectorAll("[role=tabpanel]")).toHaveLength(TABS.length);
  });

  it("no visible native scrollbar; Inter on every tab", () => {
    render(<Tabs label="Sections" tabs={TABS} />);
    expect(screen.getByRole("tablist").className.split(" ")).toContain("scrollbar-none");
    for (const t of screen.getAllByRole("tab")) expect(t.className.split(" ")).toContain("font-sans");
  });

  // jsdom has no layout: give the tablist a fixed box and a scroll position
  const fakeLayout = (list: HTMLElement, { scrollWidth, clientWidth, scrollLeft = 0 }: { scrollWidth: number; clientWidth: number; scrollLeft?: number }) => {
    Object.defineProperty(list, "scrollWidth", { configurable: true, value: scrollWidth });
    Object.defineProperty(list, "clientWidth", { configurable: true, value: clientWidth });
    list.scrollLeft = scrollLeft;
  };

  it("shows a decorative 'more tabs' cue on the edges that have more to scroll", () => {
    render(<Tabs label="Sections" tabs={TABS} />);
    const list = screen.getByRole("tablist");
    const wrapper = list.parentElement!;
    expect(wrapper.hasAttribute("data-overflow-end")).toBe(false);

    fakeLayout(list, { scrollWidth: 600, clientWidth: 300 });
    fireEvent.scroll(list);
    expect(wrapper.hasAttribute("data-overflow-end")).toBe(true);
    expect(wrapper.hasAttribute("data-overflow-start")).toBe(false);
    expect(list.className).toContain("[--fade-end:3rem]");
    const cues = wrapper.querySelectorAll("svg[aria-hidden=true]");
    expect(cues).toHaveLength(1);

    fakeLayout(list, { scrollWidth: 600, clientWidth: 300, scrollLeft: 300 });
    fireEvent.scroll(list);
    expect(wrapper.hasAttribute("data-overflow-start")).toBe(true);
    expect(wrapper.hasAttribute("data-overflow-end")).toBe(false);
  });

  it("centers the selected tab in a scrolling list", () => {
    render(<Tabs label="Sections" tabs={TABS} />);
    const list = screen.getByRole("tablist");
    fakeLayout(list, { scrollWidth: 600, clientWidth: 300 });
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo as unknown as typeof list.scrollTo;
    const target = tab("Import Forage Logs");
    Object.defineProperty(target, "offsetLeft", { configurable: true, value: 400 });
    Object.defineProperty(target, "offsetWidth", { configurable: true, value: 100 });
    fireEvent.click(target);
    // 400 - (300 - 100) / 2
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300 });
  });
});

describe("US-57: SegmentedControl", () => {
  const OPTIONS = [
    { value: "month", label: "Month" },
    { value: "week", label: "Week" },
  ];

  it("radiogroup of radios with aria-checked and roving tabindex", () => {
    render(<SegmentedControl label="Group trends by" options={OPTIONS} defaultValue="month" />);
    expect(screen.getByRole("radiogroup", { name: "Group trends by" })).toBeTruthy();
    const month = screen.getByRole("radio", { name: "Month" });
    const week = screen.getByRole("radio", { name: "Week" });
    expect(month.getAttribute("aria-checked")).toBe("true");
    expect(week.getAttribute("aria-checked")).toBe("false");
    expect(month.getAttribute("tabindex")).toBe("0");
    expect(week.getAttribute("tabindex")).toBe("-1");
  });

  it("arrows move and select (wrapping); click selects", () => {
    const onValueChange = vi.fn();
    render(<SegmentedControl label="Group trends by" options={OPTIONS} defaultValue="month" onValueChange={onValueChange} />);
    const month = screen.getByRole("radio", { name: "Month" });
    const week = screen.getByRole("radio", { name: "Week" });
    month.focus();
    fireEvent.keyDown(month, { key: "ArrowRight" });
    expect(document.activeElement).toBe(week);
    expect(week.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(week, { key: "ArrowDown" });
    expect(document.activeElement).toBe(month);
    fireEvent.click(week);
    expect(onValueChange).toHaveBeenLastCalledWith("week");
  });

  it("no 1 px jump: both states keep a border and the same weight", () => {
    render(<SegmentedControl label="Group trends by" options={OPTIONS} defaultValue="month" />);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.className.split(" ")).toContain("border");
      expect(radio.className).toContain("font-semibold");
    }
  });
});
