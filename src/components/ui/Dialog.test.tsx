// @vitest-environment jsdom
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import Dialog from "./Dialog";

afterEach(cleanup);

function Harness({ withReturnRef = false, onClose }: { withReturnRef?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const other = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <button type="button" ref={other}>
        Other
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Edit colleague"
        description="Changes are saved for every tab."
        returnFocusRef={withReturnRef ? other : undefined}
        footer={<Button>Save</Button>}
      >
        <input aria-label="Name" />
        <a href="#notes">Notes</a>
        <textarea aria-label="Note" />
      </Dialog>
    </>
  );
}

const openDialog = () => {
  const trigger = screen.getByRole("button", { name: "Open dialog" });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("dialog") };
};

describe("US-57: Dialog", () => {
  it("renders nothing while closed and, open, a portal on body named by its title", () => {
    const { container } = render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const { dialog } = openDialog();
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const title = screen.getByRole("heading", { level: 2, name: "Edit colleague" });
    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("Changes are saved for every tab.");
    expect(dialog.className).toContain("max-h-[90dvh]");
    expect(dialog.className).toContain("rounded-panel");
    expect(dialog.parentElement?.className).toContain("z-[var(--z-dialog)]");
  });

  it("moves focus in, traps Tab / Shift+Tab (incl. links and textareas) and closes with the IconButton", () => {
    render(<Harness />);
    const { trigger } = openDialog();
    const close = screen.getByRole("button", { name: "Close" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
    fireEvent.keyDown(save, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    // Focus that escaped the dialog is pulled back in
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Escape closes and focus returns to the trigger", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { trigger } = openDialog();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("a mouse down on the overlay closes; inside the panel it doesn't", () => {
    render(<Harness />);
    const { dialog } = openDialog();
    fireEvent.mouseDown(screen.getByRole("textbox", { name: "Name" }));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    // false = default prevented, so the browser can't move focus to <body> after the restore.
    expect(fireEvent.mouseDown(dialog.parentElement!)).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("locks body scroll while open and restores the previous value", () => {
    document.body.style.overflow = "scroll";
    render(<Harness />);
    openDialog();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });

  it("returnFocusRef overrides the element focused on close", () => {
    render(<Harness withReturnRef />);
    openDialog();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Other" }));
  });
});

describe("US-57: ConfirmDialog", () => {
  const renderConfirm = () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        onConfirm={onConfirm}
        onCancel={onCancel}
        title="Remove colleague?"
        objectName="Ana Pérez"
        consequences="Her 12 attendance records and coaching notes are deleted too."
        confirmLabel="Remove colleague"
      />
    );
    return { onConfirm, onCancel };
  };

  it("names the object and its consequences as the dialog's description", () => {
    renderConfirm();
    const dialog = screen.getByRole("dialog", { name: "Remove colleague?" });
    const description = document.getElementById(dialog.getAttribute("aria-describedby")!);
    expect(description?.textContent).toContain("Ana Pérez");
    expect(description?.textContent).toContain("12 attendance records");
  });

  it("starts on Cancel (secondary); the confirm button is danger", () => {
    const { onConfirm, onCancel } = renderConfirm();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Remove colleague" });
    expect(document.activeElement).toBe(cancel);
    expect(cancel.className).toContain("border-input-border");
    expect(confirm.className).toContain("bg-danger");
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(cancel);
    fireEvent.keyDown(cancel, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("stacked over a Dialog, Escape closes only the top one", () => {
    const outerClose = vi.fn();
    const innerCancel = vi.fn();
    render(
      <>
        <Dialog open onClose={outerClose} title="Outer">
          <p>Body</p>
        </Dialog>
        <ConfirmDialog open onConfirm={() => {}} onCancel={innerCancel} title="Delete?" objectName="X" consequences="Gone." confirmLabel="Delete" />
      </>
    );
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(innerCancel).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
  });
});
