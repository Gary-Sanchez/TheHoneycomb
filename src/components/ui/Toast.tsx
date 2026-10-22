import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import IconButton from "./IconButton";
import { STATUS_ICON, STATUS_SURFACE } from "./status";
import { cx } from "./styles";

// US-57: one global toast region for the whole app. ToastProvider renders, in a portal, a fixed stack
// above every layer (--z-toast) holding two live regions that always exist (a live region added
// together with its message isn't announced): role="status" for successes (polite) and
// role="alert" for errors (assertive). Successes auto-dismiss; errors stay until closed.
// Out of scope: toasts with actions (undo / retry) and toasts that survive a reload.

export type ToastKind = "success" | "error";

export interface ToastOptions {
  /** ms before it closes by itself; null keeps it until dismissed. Default: 5000 success, null error. */
  duration?: number | null;
}

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: ReactNode;
}

export interface ToastApi {
  success: (message: ReactNode, options?: ToastOptions) => number;
  error: (message: ReactNode, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

export const SUCCESS_TOAST_DURATION = 5000;

const ToastContext = createContext<ToastApi | null>(null);

/** The toast API of the nearest ToastProvider. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside a <ToastProvider>");
  return api;
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void; key?: number }) {
  const tone = item.kind === "error" ? "danger" : "success";
  const Icon = STATUS_ICON[tone];
  return (
    <div className={cx("pointer-events-auto flex items-start gap-3 rounded-card border p-4 text-body shadow-md animate-slide-up", STATUS_SURFACE[tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 pt-0.5">{item.message}</div>
      <IconButton aria-label="Dismiss notification" icon={<X className="size-4" />} className="-my-2 -mr-2" onClick={onDismiss} />
    </div>
  );
}

export function ToastProvider({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts(list => list.filter(t => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: ReactNode, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts(list => [...list, { id, kind, message }]);
      const duration = options.duration === undefined ? (kind === "success" ? SUCCESS_TOAST_DURATION : null) : options.duration;
      if (duration !== null) timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m, o) => show("success", m, o), error: (m, o) => show("error", m, o), dismiss }),
    [show, dismiss]
  );

  const region = (kind: ToastKind) =>
    toasts.filter(t => t.kind === kind).map(t => <Toast key={t.id} item={t} onDismiss={() => dismiss(t.id)} />);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          data-toast-region=""
          className="pointer-events-none fixed inset-x-4 bottom-4 z-[var(--z-toast)] flex flex-col gap-2 sm:left-auto sm:w-96"
        >
          <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
            {region("error")}
          </div>
          <div role="status" aria-live="polite" className="flex flex-col gap-2">
            {region("success")}
          </div>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
