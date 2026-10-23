// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AttendanceRecord, Attendee } from "../types";
import { ToastProvider } from "./ui";
import AttendanceLogger from "./AttendanceLogger";

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

afterEach(cleanup);

const attendees: Attendee[] = [
  { id: "a1", name: "Ana Perez", email: "ana@example.com", enrolledActivities: [], joinedDate: "2026-01-01" },
  { id: "a2", name: "Luis Gomez", enrolledActivities: [], joinedDate: "2026-01-01" },
];

function renderLogger(overrides: { canEdit?: boolean; records?: AttendanceRecord[] } = {}) {
  const onManualCheckIn = vi.fn((name: string) => ({
    attendee: { id: "new", name, enrolledActivities: [], joinedDate: "2026-06-24" },
    isNew: true,
    joinedExistingSession: false,
    alreadyInSession: false,
  }));
  const onSaveRecords = vi.fn();
  render(
    <ToastProvider>
      <AttendanceLogger
        attendees={attendees}
        records={overrides.records ?? []}
        onAddAttendee={vi.fn()}
        onSaveRecords={onSaveRecords}
        onManualCheckIn={onManualCheckIn}
        canEdit={overrides.canEdit ?? true}
      />
    </ToastProvider>
  );
  return { onManualCheckIn, onSaveRecords };
}

describe("US-60: Manual Check-In", () => {
  it("Add & Check In with an empty name shows the error next to the field and focuses it", () => {
    const { onManualCheckIn } = renderLogger();
    const name = screen.getByRole("textbox", { name: "Colleague name" });
    expect(name.getAttribute("aria-invalid")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add & Check In" }));

    expect(onManualCheckIn).not.toHaveBeenCalled();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    const error = document.getElementById(name.getAttribute("aria-describedby")!);
    expect(error?.textContent).toBe("Enter the colleague's name.");

    // Typing clears the error
    fireEvent.change(name, { target: { value: "Jean" } });
    expect(name.getAttribute("aria-invalid")).toBeNull();
  });

  it("a successful check-in is announced in the global toast region", () => {
    const { onManualCheckIn } = renderLogger();
    fireEvent.change(screen.getByRole("textbox", { name: "Colleague name" }), { target: { value: "Jean Dupont" } });
    fireEvent.click(screen.getByRole("button", { name: "Add & Check In" }));

    expect(onManualCheckIn).toHaveBeenCalledWith("Jean Dupont", "2026-06-24", "Speakeasy");
    const status = screen.getAllByRole("status").find(el => el.textContent?.includes("Added and checked in Jean Dupont"));
    expect(status).toBeTruthy();
  });

  it("Present / Absent are radios that announce the active one", () => {
    renderLogger();
    const group = screen.getByRole("radiogroup", { name: "Attendance for Ana Perez" });
    const present = within(group).getByRole("radio", { name: "Present" });
    const absent = within(group).getByRole("radio", { name: "Absent" });
    expect(present.getAttribute("aria-checked")).toBe("true");
    expect(absent.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(absent);
    expect(absent.getAttribute("aria-checked")).toBe("true");
    expect(present.getAttribute("aria-checked")).toBe("false");
  });

  it("All Present / All Absent mark every colleague and show which applies", () => {
    renderLogger();
    const markAll = screen.getByRole("radiogroup", { name: "Mark every colleague" });
    const allPresent = within(markAll).getByRole("radio", { name: "All Present" });
    const allAbsent = within(markAll).getByRole("radio", { name: "All Absent" });
    expect(allPresent.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(allAbsent);
    expect(allAbsent.getAttribute("aria-checked")).toBe("true");
    for (const name of ["Ana Perez", "Luis Gomez"]) {
      const row = screen.getByRole("radiogroup", { name: `Attendance for ${name}` });
      expect(within(row).getByRole("radio", { name: "Absent" }).getAttribute("aria-checked")).toBe("true");
    }

    // A mixed list selects neither
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Attendance for Ana Perez" })).getByRole("radio", { name: "Present" }));
    expect(allPresent.getAttribute("aria-checked")).toBe("false");
    expect(allAbsent.getAttribute("aria-checked")).toBe("false");
  });

  it("the date, activity and add-form fields are labelled, and the list is not a scroll box", () => {
    renderLogger();
    expect(screen.getByLabelText("Event Date").getAttribute("type")).toBe("date");
    expect((screen.getByLabelText("Activity") as HTMLSelectElement).value).toBe("Speakeasy");

    fireEvent.click(screen.getByRole("button", { name: "Add Colleague" }));
    expect(screen.getByLabelText("Full Name").hasAttribute("required")).toBe(true);
    expect(screen.getByLabelText("Email Address (Optional)").getAttribute("type")).toBe("email");

    const list = screen.getByRole("list");
    expect(list.className).not.toMatch(/overflow|max-h/);
  });

  it("read-only mode disables the controls", () => {
    renderLogger({ canEdit: false });
    expect(screen.getByRole("button", { name: "Add & Check In" }).matches(":disabled")).toBe(true);
    expect((screen.getByRole("button", { name: "Save Attendance Records" }) as HTMLButtonElement).disabled).toBe(true);
    for (const radio of within(screen.getByRole("radiogroup", { name: "Attendance for Ana Perez" })).getAllByRole("radio")) {
      expect((radio as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
