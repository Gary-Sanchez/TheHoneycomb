// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Attendee } from "../types";
import DocumentParser from "./DocumentParser";

// canvas-confetti needs a real canvas; the import flow only calls it
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

const attendees: Attendee[] = [{ id: "a1", name: "Elena Rostova", enrolledActivities: ["Speakeasy"], joinedDate: "2026-01-01" } as Attendee];

const csvFile = (records: object[], extra: object) => ({
  csv: true,
  activitySource: null,
  dateDetected: true,
  durationFilterApplied: true,
  excludedByDuration: [],
  excludedByBlacklist: 0,
  duplicateOf: null,
  alreadyImported: null,
  alreadyLoaded: null,
  fingerprint: "hash",
  records,
  ...extra,
});

// Two .csv files: the first one's activity is detected from its name, the second one's is not (US-37)
const BATCH_RESPONSE = {
  files: [
    csvFile(
      [
        { name: "Elena Rostova", activity: "Speakeasy", date: "2026-06-24", status: "present" },
        { name: "Maria Lopez", activity: "Speakeasy", date: "2026-06-24", status: "present" },
      ],
      { filename: "speakeasy-june.csv", activity: "Speakeasy", activitySource: "file name" }
    ),
    csvFile(
      [{ name: "Carlos Gomez", activity: "", date: "2026-06-24", status: "absent", needsReview: true, reviewReason: "Duration unreadable" }],
      { filename: "notes.csv", activity: "", fingerprint: "hash2" }
    ),
  ],
};

const jsonResponse = (data: unknown) => ({
  status: 200,
  ok: true,
  headers: { get: () => "application/json" },
  json: async () => data,
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(BATCH_RESPONSE)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderParser(onImportData = vi.fn(async () => ({ ok: true as const, added: 3, updated: 0 }))) {
  render(<DocumentParser attendees={attendees} onImportData={onImportData as any} canEdit />);
  return onImportData;
}

async function loadPreview() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["a"], "speakeasy-june.csv"), new File(["b"], "notes.csv")] } });
  fireEvent.click(screen.getByRole("button", { name: "Extract the Buzz" }));
  await screen.findByText("Review Extracted Records");
}

describe("US-66: Import Forage Logs, accessible and responsive", () => {
  it("shows the batch limits in the upload zone before choosing files", () => {
    renderParser();
    expect(screen.getByTestId("upload-limits").textContent).toBe(
      "Limits: up to 50 .csv files per batch · 10 MB per file · 50 MB per batch."
    );
    // The existing copy stays as it was
    expect(screen.getByText(/Supports Excel spreadsheets, Word documents, and plain-text CSVs\. Select up to 50 \.csv files at once\./)).toBeTruthy();
  });

  it("preview: DataTable per file with the name as pinned row header, Remove <name> icon buttons", async () => {
    renderParser();
    await loadPreview();
    const regions = screen.getAllByRole("region", { name: /^Attendance records in / });
    expect(regions).toHaveLength(2);
    const nameHeader = within(regions[0]).getByRole("rowheader", { name: /Elena Rostova/ });
    expect(nameHeader.className).toContain("sticky");
    for (const name of ["Elena Rostova", "Maria Lopez", "Carlos Gomez"]) {
      const button = screen.getByRole("button", { name: `Remove ${name}` });
      expect(button.className).toContain("size-10");
      expect(button.getAttribute("title")).toBe("Remove Row");
    }
  });

  it("labels: batch, group and row dates and the undetected-activity selector", async () => {
    renderParser();
    await loadPreview();
    expect((screen.getByLabelText("Event date for all files") as HTMLInputElement).type).toBe("date");
    expect(screen.getAllByLabelText("Event Date")).toHaveLength(2);
    for (const name of ["Elena Rostova", "Maria Lopez", "Carlos Gomez"]) {
      expect((screen.getByLabelText(`Event date for ${name}`) as HTMLInputElement).value).toBe("2026-06-24");
    }
    expect(screen.getByRole("combobox", { name: "Activity for notes.csv" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Activity for speakeasy-june.csv" })).toBeTruthy();
  });

  it("badges: StatusBadge for roster status (info / success), Needs Review warning, activities with icon", async () => {
    renderParser();
    await loadPreview();
    const newBadges = screen.getAllByText("New Colleague");
    expect(newBadges).toHaveLength(2);
    for (const badge of newBadges) expect(badge.className).toContain("text-info");
    expect(screen.getByText("Existing Colleague").className).toContain("text-success");
    const review = screen.getByText("Needs Review");
    expect(review.className).toContain("text-warning");
    expect(review.getAttribute("title")).toBe("Duration unreadable");
    expect(screen.getByText("Activity Not Detected").getAttribute("role")).toBe("alert");
    const fileActivity = screen.getByTestId("file-activity");
    expect(fileActivity.textContent).toContain("Speakeasy");
    expect(fileActivity.querySelector("svg.lucide-messages-square")).toBeTruthy();
  });

  it("sticky bar: summary of files, new and existing colleagues next to Confirm", async () => {
    renderParser();
    await loadPreview();
    const bar = screen.getByRole("region", { name: "Import summary" });
    expect(bar.className).toContain("sticky");
    expect(bar.className).toContain("bottom-0");
    expect(within(bar).getByTestId("batch-summary").textContent).toBe("2 files · 2 new colleagues · 1 existing colleague");
    const confirm = within(bar).getByRole("button", { name: "Confirm & Import Caserits" }) as HTMLButtonElement;
    // notes.csv has no activity yet (US-37)
    expect(confirm.disabled).toBe(true);
    expect(within(bar).getByRole("button", { name: "Discard" })).toBeTruthy();
  });

  it("Discard asks in a ConfirmDialog with the files and colleagues; Cancel keeps the batch", async () => {
    renderParser();
    await loadPreview();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    const dialog = screen.getByRole("dialog", { name: "Discard this preview?" });
    expect(dialog.textContent).toContain("2 files · 3 colleagues");
    expect(dialog.textContent).toContain("3 attendance records will not be imported.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Maria Lopez" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("Review Extracted Records")).toBeNull();
    expect(screen.getByTestId("upload-limits")).toBeTruthy();
  });

  it("the import flow is unchanged: pick the activity, Confirm creates the new colleagues once", async () => {
    const onImportData = renderParser();
    await loadPreview();
    fireEvent.change(screen.getByRole("combobox", { name: "Activity for notes.csv" }), { target: { value: "Music Room" } });
    const confirm = screen.getByRole("button", { name: "Confirm & Import Caserits" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(onImportData).toHaveBeenCalledTimes(1));
    const [newAttendees, records] = onImportData.mock.calls[0] as unknown as [{ name: string; enrolledActivities: string[] }[], { attendeeId: string; activity: string }[]];
    expect(newAttendees.map(a => a.name)).toEqual(["Maria Lopez", "Carlos Gomez"]);
    expect(newAttendees[1].enrolledActivities).toEqual(["Music Room"]);
    expect(records).toHaveLength(3);
    expect(records[0].attendeeId).toBe("a1");
    await screen.findByText("Import Complete");
  });
});
