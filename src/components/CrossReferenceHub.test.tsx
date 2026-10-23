// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AttendanceRecord, Attendee } from "../types";
import CrossReferenceHub from "./CrossReferenceHub";

afterEach(cleanup);

const attendee = (id: string): Attendee => ({ id, name: id, enrolledActivities: [], joinedDate: "2026-01-01" });
let seq = 0;
const rec = (attendeeId: string, activity: string): AttendanceRecord => ({
  id: `r${seq++}`,
  attendeeId,
  attendeeName: attendeeId,
  activity,
  date: "2026-06-01",
  status: "present",
});

// ana: Speakeasy + Reading Club + Music Room (3) · bea: Speakeasy + Reading Club (2) · cal: Speakeasy (1) · dan: none
const attendees = ["ana", "bea", "cal", "dan"].map(attendee);
const records = [
  rec("ana", "Speakeasy"), rec("ana", "Reading Club"), rec("ana", "Music Room"),
  rec("bea", "Speakeasy"), rec("bea", "Reading Club"),
  rec("cal", "Speakeasy"),
];

const setup = () => render(<CrossReferenceHub attendees={attendees} records={records} onNavigateToAttendee={vi.fn()} />);
const optionsOf = (select: HTMLElement) => within(select).getAllByRole("option").map(o => o.textContent);

describe("US-63: Overlap Cross-Referencer", () => {
  it("has its h2 and visible labels tied to the selectors", () => {
    setup();
    expect(screen.getByRole("heading", { level: 2, name: "Overlap Cross-Referencer" })).toBeTruthy();
    const first = screen.getByLabelText("First Activity");
    expect(first.tagName).toBe("SELECT");
    expect((screen.getByText("First Activity") as HTMLLabelElement).htmlFor).toBe(first.id);
    expect(screen.getByLabelText("Second Activity").tagName).toBe("SELECT");
  });

  it("never offers the same activity in both selectors", () => {
    setup();
    const first = screen.getByLabelText("First Activity");
    const second = screen.getByLabelText("Second Activity");
    expect(optionsOf(second)).not.toContain("Speakeasy");
    expect(optionsOf(first)).not.toContain("Reading Club");
    fireEvent.change(first, { target: { value: "Writing Hood" } });
    expect(optionsOf(second)).not.toContain("Writing Hood");
    expect(optionsOf(second)).toContain("Speakeasy");
    expect((second as HTMLSelectElement).value).toBe("Reading Club");
  });

  it("keeps the comparison results", () => {
    setup();
    // Speakeasy ∩ Reading Club = ana, bea
    expect(screen.getByText("Shared Colleague Cohort (2)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Second Activity"), { target: { value: "Music Room" } });
    expect(screen.getByText("Shared Colleague Cohort (1)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Second Activity"), { target: { value: "Writing Hood" } });
    expect(screen.getByText("No colleagues attended both activities yet.")).toBeTruthy();
  });

  it("renders the filter as a wrapping radio group and filters the matrix", () => {
    setup();
    const group = screen.getByRole("radiogroup", { name: "Filter by number of activities" });
    expect(group.className).toContain("flex-wrap");
    expect(within(group).getAllByRole("radio").map(r => r.textContent)).toEqual([
      "All (4)", "Single (1)", "Multi-Activity (2+) (2)", "Super Active (1)",
    ]);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "Multi-Activity (2+) (2)" }));
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: "Super Active (1)" }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });

  it("matrix is a DataTable with accessible Attended / Not attended cells and legible dashes", () => {
    setup();
    const table = screen.getByRole("table", { name: "Participation Matrix Directory" });
    expect(screen.getByRole("region", { name: "Participation Matrix Directory" })).toBeTruthy();
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual([
      "Colleague Name", "Speakeasy", "Reading Club", "Music Room", "Writing Hood", "Total Activities",
    ]);
    const cal = within(table).getByRole("row", { name: /cal/ });
    expect(within(cal).getAllByText("Attended")).toHaveLength(1);
    expect(within(cal).getAllByText("Not attended")).toHaveLength(3);
    const dash = within(cal).getAllByText("—")[0];
    expect(dash.className).toContain("text-text-muted");
    expect(dash.getAttribute("aria-hidden")).toBe("true");
    expect(within(table).getByRole("rowheader", { name: /ana/ }).textContent).toContain("Super Active");
  });

  it("each activity shows its icon in the matrix header", () => {
    setup();
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").slice(1, 5);
    for (const h of headers) expect(h.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });
});
