// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AttendanceRecord, Attendee } from "../types";
import AttendeeDirectory, { initials } from "./AttendeeDirectory";

afterEach(cleanup);

const ATTENDEES: Attendee[] = [
  { id: "a1", name: "Ana Maria Lopez", email: "ana@example.com", enrolledActivities: ["Speakeasy"], joinedDate: "2026-01-05" },
  { id: "a2", name: "Beto", enrolledActivities: ["Speakeasy"], joinedDate: "2026-02-10" },
];
const RECORDS: AttendanceRecord[] = [
  { id: "r1", attendeeId: "a1", attendeeName: "Ana Maria Lopez", activity: "Speakeasy", date: "2026-06-01", status: "present" },
];

function Harness({ canEdit = true, onRemove = vi.fn() }: { canEdit?: boolean; onRemove?: (id: string) => void }) {
  const [attendees, setAttendees] = useState(ATTENDEES);
  return (
    <AttendeeDirectory
      attendees={attendees}
      records={RECORDS}
      onAddAttendee={() => ATTENDEES[0]}
      onUpdateEnrollment={() => {}}
      onViewReport={() => {}}
      onRemoveAttendee={id => {
        onRemove(id);
        setAttendees(list => list.filter(a => a.id !== id));
      }}
      canEdit={canEdit}
    />
  );
}

describe("US-62: Caserits & Progress", () => {
  it("shows the table inside a DataTable scroll region with the name column pinned", () => {
    render(<Harness />);
    const region = screen.getByRole("region", { name: "Caserits" });
    expect(region.className).toContain("overflow-x-auto");
    const headers = within(region).getAllByRole("columnheader").map(h => h.textContent);
    expect(headers).toEqual(["Caserits", "Attendance Rate", "Hive Status", "Date Joined", "Actions"]);
    const nameCell = within(region).getByRole("rowheader", { name: /Ana Maria Lopez/ });
    expect(nameCell.className).toContain("sticky");
    expect(nameCell.className).toContain("left-0");
  });

  it("does not use headings for the colleagues' names", () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll("h4")).toHaveLength(0);
    for (const heading of screen.queryAllByRole("heading")) {
      expect(heading.textContent).not.toMatch(/Ana Maria Lopez|Beto/);
    }
  });

  it("avatars show two initials and Hive Status uses TierBadge", () => {
    expect(initials("Ana Maria Lopez")).toBe("AL");
    expect(initials("beto")).toBe("BE");
    expect(initials("  ")).toBe("");
    render(<Harness />);
    expect(screen.getByText("AL")).toBeTruthy();
    expect(screen.getByText("BE")).toBeTruthy();
    expect(screen.getAllByTestId("hive-status")).toHaveLength(2);
  });

  it("the search is a labelled field with a clear button that empties it", () => {
    render(<Harness />);
    const search = screen.getByLabelText("Search colleagues") as HTMLInputElement;
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    fireEvent.change(search, { target: { value: "beto" } });
    expect(screen.queryByText("Ana Maria Lopez")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search.value).toBe("");
    expect(screen.getByText("Ana Maria Lopez")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("search, filter, form fields and icon buttons have accessible names", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Search colleagues")).toBeTruthy();
    expect(screen.getByLabelText("Filter by activity")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Ana Maria Lopez" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Add Colleague" })[0]);
    expect(screen.getByLabelText("Full Name")).toBeTruthy();
    expect(screen.getByLabelText("Email Address (Optional)")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Cancel" }).length).toBeGreaterThanOrEqual(2);
  });

  it("delete opens a ConfirmDialog that names the colleague and the cascade; Escape does not delete and focus returns to the trash", () => {
    const onRemove = vi.fn();
    render(<Harness onRemove={onRemove} />);
    const trash = screen.getByRole("button", { name: "Delete Ana Maria Lopez" });
    trash.focus();
    fireEvent.click(trash);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete Ana Maria Lopez?")).toBeTruthy();
    expect(within(dialog).getByText("Their attendance records and coaching notes will also be deleted.")).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText("Ana Maria Lopez")).toBeTruthy();
    expect(document.activeElement).toBe(trash);
  });

  it("Cancel does not delete and returns focus to the trash", () => {
    const onRemove = vi.fn();
    render(<Harness onRemove={onRemove} />);
    const trash = screen.getByRole("button", { name: "Delete Beto" });
    trash.focus();
    fireEvent.click(trash);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trash);
  });

  it("confirming deletes the colleague", () => {
    const onRemove = vi.fn();
    render(<Harness onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Beto" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(onRemove).toHaveBeenCalledWith("a2");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Beto")).toBeNull();
  });

  it("read-only: the trash buttons are disabled and no dialog opens", () => {
    render(<Harness canEdit={false} />);
    const trash = screen.getByRole("button", { name: "Delete Beto" }) as HTMLButtonElement;
    expect(trash.disabled).toBe(true);
    fireEvent.click(trash);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
