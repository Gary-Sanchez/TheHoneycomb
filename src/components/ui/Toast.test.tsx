// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Alert from "./Alert";
import { SUCCESS_TOAST_DURATION, ToastProvider, useToast } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Triggers() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.success("Attendance saved")}>
        Success
      </button>
      <button type="button" onClick={() => toast.error("Could not save")}>
        Error
      </button>
    </>
  );
}

const regions = () => {
  const region = document.querySelector("[data-toast-region]") as HTMLElement;
  return { region, status: within(region).getByRole("status"), alert: within(region).getByRole("alert") };
};

describe("US-57: Toast", () => {
  it("one global region in a portal, with both live regions present before any toast", () => {
    const { container } = render(
      <ToastProvider>
        <Triggers />
      </ToastProvider>
    );
    const { region, status, alert } = regions();
    expect(document.querySelectorAll("[data-toast-region]")).toHaveLength(1);
    expect(container.contains(region)).toBe(false);
    expect(region.className).toContain("z-[var(--z-toast)]");
    expect(region.className).toContain("fixed");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(status.textContent).toBe("");
    expect(alert.textContent).toBe("");
  });

  it("successes go to role=status and auto-dismiss; errors go to role=alert and stay until closed", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Triggers />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Success" }));
    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    const { status, alert } = regions();
    expect(status.textContent).toContain("Attendance saved");
    expect(alert.textContent).toContain("Could not save");

    act(() => {
      vi.advanceTimersByTime(SUCCESS_TOAST_DURATION);
    });
    expect(status.textContent).toBe("");
    expect(alert.textContent).toContain("Could not save");

    fireEvent.click(within(alert).getByRole("button", { name: "Dismiss notification" }));
    expect(alert.textContent).toBe("");
  });

  it("WCAG 2.2.1: hover or focus pauses the auto-dismiss, which resumes with the time left", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Triggers />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Success" }));
    const { status } = regions();
    const toast = () => status.firstElementChild as HTMLElement;

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    fireEvent.mouseEnter(toast());
    act(() => {
      vi.advanceTimersByTime(SUCCESS_TOAST_DURATION * 2);
    });
    expect(status.textContent).toContain("Attendance saved");

    // Focus inside keeps it paused even after the pointer leaves
    fireEvent.focus(within(toast()).getByRole("button", { name: "Dismiss notification" }));
    fireEvent.mouseLeave(toast());
    act(() => {
      vi.advanceTimersByTime(SUCCESS_TOAST_DURATION * 2);
    });
    expect(status.textContent).toContain("Attendance saved");

    fireEvent.blur(within(toast()).getByRole("button", { name: "Dismiss notification" }));
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(status.textContent).toContain("Attendance saved");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(status.textContent).toBe("");
  });

  it("useToast outside a provider throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Triggers />)).toThrow(/ToastProvider/);
  });
});

describe("US-57: Alert", () => {
  it("errors are role=alert, other tones role=status, with status-token colors", () => {
    render(
      <>
        <Alert tone="danger" title="Import failed">
          The file has no names.
        </Alert>
        <Alert tone="success">Imported 12 records.</Alert>
      </>
    );
    const error = screen.getByRole("alert");
    expect(error.textContent).toContain("Import failed");
    expect(error.className).toContain("bg-danger-bg");
    expect(error.className).toContain("text-danger");
    expect(screen.getByRole("status").className).toContain("bg-success-bg");
  });

  it("onDismiss adds a named close button", () => {
    const onDismiss = vi.fn();
    render(
      <Alert tone="warning" onDismiss={onDismiss}>
        Careful.
      </Alert>
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
