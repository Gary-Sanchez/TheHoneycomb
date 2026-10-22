import type { ReactNode } from "react";
import { X } from "lucide-react";
import IconButton from "./IconButton";
import type { StatusTone } from "./Badge";
import { STATUS_ICON, STATUS_SURFACE } from "./status";
import { cx, type NativeAttributes } from "./styles";

// US-57: inline message (a form error, a warning above a table…). Errors are role="alert"
// (announced at once); the other tones are role="status" (polite). Tone = status tokens + icon.

export interface AlertProps extends NativeAttributes {
  tone?: StatusTone;
  /** Optional bold first line. */
  title?: ReactNode;
  /** Shows a close button that calls it. */
  onDismiss?: () => void;
  dismissLabel?: string;
}

export default function Alert({ tone = "info", title, onDismiss, dismissLabel = "Dismiss", className, children, ...rest }: AlertProps) {
  const Icon = STATUS_ICON[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      {...rest}
      className={cx("flex items-start gap-3 rounded-card border p-4 text-body", STATUS_SURFACE[tone], className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
      </div>
      {onDismiss && <IconButton aria-label={dismissLabel} icon={<X className="size-4" />} className="-my-2 -mr-2" onClick={onDismiss} />}
    </div>
  );
}
