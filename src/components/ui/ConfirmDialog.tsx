import { useId, useRef, type ReactNode, type RefObject } from "react";
import Button from "./Button";
import Dialog from "./Dialog";

// US-57: confirmation of a destructive action, on top of Dialog. It names the object and spells out
// the consequences (the dialog's description); Cancel (secondary) gets the initial focus, so Enter
// right after opening never destroys anything, and the confirm button is the `danger` variant.

export interface ConfirmDialogProps {
  open: boolean;
  /** Cancel, Escape, overlay click and the close button. */
  onCancel: () => void;
  onConfirm: () => void;
  /** e.g. "Remove colleague?" */
  title: ReactNode;
  /** The object the action applies to, e.g. the colleague's name. */
  objectName: ReactNode;
  /** What happens if confirmed, e.g. "Their 12 attendance records and coaching notes are deleted." */
  consequences: ReactNode;
  /** e.g. "Remove colleague" — name the action, not "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Shows the spinner on the confirm button while the action runs. */
  loading?: boolean;
  /** Where focus goes on close (default: the element focused when it opened). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  objectName,
  consequences,
  confirmLabel,
  cancelLabel = "Cancel",
  loading = false,
  returnFocusRef,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      initialFocusRef={cancelRef}
      returnFocusRef={returnFocusRef}
      aria-describedby={bodyId}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div id={bodyId} className="rounded-card border border-danger-border bg-danger-bg p-4 text-danger">
        <p className="font-semibold">{objectName}</p>
        <p className="mt-1">{consequences}</p>
      </div>
    </Dialog>
  );
}
