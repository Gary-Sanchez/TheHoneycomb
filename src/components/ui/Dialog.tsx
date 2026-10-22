import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import IconButton from "./IconButton";
import { cx, type NativeAttributes } from "./styles";

// US-57: the accessible modal dialog, extracted from the 4.0 OutcomeReportModal and completed with
// a portal and a dvh-based max height. Focus goes in on open (initialFocusRef or the first
// focusable), Tab / Shift+Tab wrap inside, Escape and a click on the overlay close it, the page
// behind doesn't scroll, and on close focus returns to the element that opened it.

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface FocusableRef {
  current: HTMLElement | null;
}

export type DialogSize = "sm" | "md" | "lg";

const SIZES: Record<DialogSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-3xl",
};

export interface DialogProps extends NativeAttributes {
  open: boolean;
  /** Called on Escape, overlay click and the close button. */
  onClose: () => void;
  /** Rendered as the dialog's h2 and referenced by aria-labelledby. */
  title: ReactNode;
  /** Optional text under the title, referenced by aria-describedby. */
  description?: ReactNode;
  /** Actions row at the bottom (e.g. Cancel + Save). */
  footer?: ReactNode;
  size?: DialogSize;
  /** Element focused on open; defaults to the first focusable element. */
  initialFocusRef?: FocusableRef;
  /** Element focused on close; defaults to the element that was focused when the dialog opened. */
  returnFocusRef?: FocusableRef;
  /** Accessible name of the close button. */
  closeLabel?: string;
}

// Open dialogs, innermost last: only the top one reacts to Escape / Tab (a ConfirmDialog over a Dialog).
const openStack: object[] = [];

function DialogContent({
  open: _open,
  onClose,
  title,
  description,
  footer,
  size = "md",
  initialFocusRef,
  returnFocusRef,
  closeLabel = "Close",
  className,
  children,
  ...rest
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const focusRefs = useRef({ initialFocusRef, returnFocusRef });

  useEffect(() => {
    const token = {};
    openStack.push(token);
    const dialog = dialogRef.current;
    const { initialFocusRef: initial, returnFocusRef: returnRef } = focusRefs.current;
    const returnTo = returnRef?.current ?? (document.activeElement as HTMLElement | null);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (initial?.current ?? dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== token || !dialog) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const outside = !dialog.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openStack.splice(openStack.indexOf(token), 1);
      document.body.style.overflow = prevOverflow;
      returnTo?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center bg-forest/45 p-4 animate-fade-in"
      onMouseDown={(e: MouseEvent) => {
        if (e.target !== e.currentTarget) return;
        // Without this the browser's default mousedown action runs after the dialog has closed and
        // moves focus to <body>, undoing the restore to the trigger.
        e.preventDefault();
        onCloseRef.current();
      }}
    >
      <div
        {...rest}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : (rest["aria-describedby"] as string | undefined)}
        tabIndex={-1}
        className={cx(
          "flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-panel bg-cream text-forest shadow-2xl animate-slide-up",
          SIZES[size],
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-serif text-h2 font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-body text-text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton aria-label={closeLabel} icon={<X className="size-5" />} onClick={() => onCloseRef.current()} />
        </div>
        {children !== undefined && <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 text-body">{children}</div>}
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** Modal dialog rendered in a portal on document.body. Mount/unmount it with `open`. */
export default function Dialog({ open, ...rest }: DialogProps) {
  if (!open) return null;
  return createPortal(<DialogContent {...rest} open />, document.body);
}
