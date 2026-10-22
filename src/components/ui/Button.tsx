import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS, DISABLED, LINK_SIZES, cx, type ButtonSize, type ButtonVariant, type NativeAttributes } from "./styles";

export interface ButtonProps extends NativeAttributes {
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  variant?: ButtonVariant;
  /** sm = h-9, md = h-11 (default), lg = h-12. `link` only takes the text size. */
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and disables the button; the label stays (same accessible name). */
  loading?: boolean;
  /** Decorative leading icon (hidden from assistive tech). Replaced by the spinner while loading. */
  icon?: ReactNode;
}

// US-56: the base button. Every variant shares the same disabled look (DISABLED) and the global
// focus ring. Defaults to type="button" so it never submits a form by accident.
export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], variant === "link" ? LINK_SIZES[size] : BUTTON_SIZES[size], DISABLED, className)}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        icon && <span className="inline-flex shrink-0" aria-hidden="true">{icon}</span>
      )}
      {children}
    </button>
  );
}
